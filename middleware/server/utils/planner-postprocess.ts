/**
 * Post-proceso de grabs del planificador — COLA DE TAREAS POR PASOS.
 *
 * Cuando un grab del planificador completa su descarga (lo detecta el importer),
 * se marca `post_step = 'locate'` y este módulo avanza UN paso por ciclo de
 * cron (1 minuto):
 *
 *   locate  — ¿existe el archivo descargado en /downloads? (reintenta hasta
 *             que el cliente de descarga lo deje en el volumen compartido)
 *   rename  — si la subscription tiene `smart_rename`, aplica el renombrado
 *             limpio (Series - S01E02 - Título.ext) en el sitio.
 *   move    — si el destino no es la carpeta por defecto, encola un movimiento
 *             en la cola del systray (igual que el file manager) y espera a que
 *             el archivo aparezca en la carpeta de destino.
 *   done    — archivo en destino: marca el episodio/película `downloaded` y
 *             guarda `file_path`.
 *
 * Así `downloaded` significa SIEMPRE "el archivo existe en la carpeta de
 * destino", y el largo tiempo entre "el servicio terminó" y "el archivo aparece
 * en /downloads" ya no rompe el proceso (se reintenta cada minuto sin límite).
 *
 * Reutiliza el motor de transferencia compartido (transfer-engine) y la cola
 * del systray (transfer-queue).
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { useDatabase, getConfig } from "./database";
import { recordGrabLog } from "./planner-db";
import { getDownloadsRoot, resolveVirtualPath, smbStat } from "./remoteMounts";
import { movePath } from "./transfer-engine";
import { enqueueTransferJob, isPathInActiveTransfer } from "./transfer-queue";
import { useTransmissionClient } from "./transmission-client";
import { useSlskdClient } from "./slskd-client";
import { useAmuleClient } from "./amule-client";
import { refreshPlexLibraries } from "~/services/plex";
import {
  getSmartRenameSuggestion,
  buildProviderPreferredLocales,
  normalizeLocale,
} from "~/services/smart-rename";

/** Datos del grab enriquecidos con la subscription (query del post-proceso). */
export interface PostProcessGrab {
  id: number;
  subscription_id: number;
  service: string;
  release_hash: string | null;
  release_title: string | null;
  episode_id: number | null;
  movie_id: number | null;
  root_folder: string | null;
  smart_rename: number | boolean;
  plex_scan: number | boolean;
  post_step: string | null;
  located_path: string | null;
  move_job_id: string | null;
}

export interface LocatedFile {
  absPath: string;
  virtual: string;
  name: string;
  isDir: boolean;
}

// ─── Normalización para comparar nombres ────────────────────────────────────

function norm(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ─── Smart rename ────────────────────────────────────────────────────────────

/**
 * Nombre final del smart rename usando el MISMO cleaner que el file manager
 * (services/smart-rename). Devuelve null si no se puede determinar un nombre
 * razonable (tipo desconocido o el fallback "File" del cleaner).
 */
async function suggestSmartRename(virtual: string): Promise<string | null> {
  const tmdbPreferredLocales = buildProviderPreferredLocales(
    normalizeLocale(getConfig("tmdb_locale") ?? ""),
    [],
  );
  const tvdbPreferredLocales = buildProviderPreferredLocales(
    normalizeLocale(getConfig("tvdb_locale") ?? ""),
    [],
  );

  const res = await getSmartRenameSuggestion(virtual, {
    tmdbPreferredLocales,
    tvdbPreferredLocales,
    includeCleanup: true,
    includeIntegrations: true,
  });

  // "File"/"File.ext" es el marcador del cleaner cuando no reconoce el tipo.
  const stem = String(res.suggested ?? "").replace(/\.[^.]+$/, "");
  if (res.type === "unknown" || /^file$/i.test(stem)) return null;
  return res.suggested;
}

// ─── Localización del archivo descargado ────────────────────────────────────

function toVirtual(absPath: string): string {
  const root = getDownloadsRoot().replace(/\/+$/, "");
  if (absPath === root) return "home";
  if (absPath.startsWith(root + "/")) return "home/" + absPath.slice(root.length + 1);
  return absPath;
}

/** Búsqueda acotada por nombre en el árbol de descargas (fallback genérico). */
async function searchByName(
  keyword: string | null,
  maxDepth = 6,
): Promise<LocatedFile | null> {
  if (!keyword) return null;
  const root = getDownloadsRoot();
  const target = norm(keyword);
  if (!target) return null;

  let best: LocatedFile | null = null;
  let bestMtime = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      if (ent.name.includes(".part") || ent.name.endsWith(".!ut") || ent.name === "@@") continue;
      const abs = join(dir, ent.name);
      if (!norm(ent.name)) continue;
      const nm = norm(ent.name);
      if (nm.includes(target) || target.includes(nm)) {
        let mtime = 0;
        try { mtime = statSync(abs).mtimeMs; } catch { /* ignore */ }
        if (mtime >= bestMtime) {
          bestMtime = mtime;
          best = { absPath: abs, virtual: toVirtual(abs), name: ent.name, isDir: ent.isDirectory() };
        }
      }
      if (ent.isDirectory()) walk(abs, depth + 1);
    }
  };
  walk(root, 0);
  return best;
}

async function locateTransmission(grab: PostProcessGrab): Promise<LocatedFile | null> {
  if (!grab.release_hash) return null;
  const client = useTransmissionClient();
  const torrents = await client.getTorrents();
  const t = torrents.find((x: any) => {
    const h = x.hashString ?? x.hash ?? "";
    return String(h).toLowerCase() === grab.release_hash!.toLowerCase();
  });
  if (!t) return null;
  const dir = String(t.downloadDir ?? getDownloadsRoot()).replace(/\/+$/, "");
  const name = String(t.name ?? "");
  if (!name) return null;
  const abs = join(dir, name);
  if (!existsSync(abs)) return null;
  let isDir = false;
  try { isDir = statSync(abs).isDirectory(); } catch { /* ignore */ }
  return { absPath: abs, virtual: toVirtual(abs), name, isDir };
}

async function locateSlskd(grab: PostProcessGrab): Promise<LocatedFile | null> {
  if (!grab.release_title) return null;
  const client = useSlskdClient();
  const groups = await client.getTransfersGrouped("download");
  const root = getDownloadsRoot().replace(/\/+$/, "");
  const target = norm(grab.release_title);
  const wantBase = basename(grab.release_title);

  for (const userGrp of groups ?? []) {
    const username = userGrp.username ?? "";
    for (const dirEntry of userGrp.directories ?? []) {
      for (const file of dirEntry.files ?? []) {
        const state = String(file.state ?? "");
        if (!state.includes("Completed")) continue;
        const remoteName = String(file.filename ?? "");
        const base = basename(remoteName.replace(/\\/g, "/"));
        if (norm(base) !== target && norm(base) !== norm(wantBase)) continue;
        const dirName = String(dirEntry.name ?? "");
        const sub = [dirName.replace(/^[\\/]+/, ""), base].filter(Boolean).join("/");
        const abs = join(root, username, sub);
        if (!existsSync(abs)) continue;
        return { absPath: abs, virtual: toVirtual(abs), name: base, isDir: false };
      }
    }
  }
  return null;
}

async function locateAmule(grab: PostProcessGrab): Promise<LocatedFile | null> {
  if (!grab.release_hash) return null;
  const client = useAmuleClient();
  try {
    const shared = await client.getSharedFiles();
    const hash = grab.release_hash.toLowerCase();
    const f = (shared ?? []).find((x: any) => {
      const h = String(x.fileHashHexString ?? "").toLowerCase();
      return h === hash;
    });
    const name = f?.fileName as string | undefined;
    if (!name) return null;
    const candidates = [name];
    const root = getDownloadsRoot().replace(/\/+$/, "");
    if (!name.startsWith("/")) {
      candidates.push(join(root, name));
      candidates.push(join(root, "temp", name));
    }
    for (const c of candidates) {
      if (existsSync(c)) {
        return { absPath: c, virtual: toVirtual(c), name: basename(c), isDir: false };
      }
    }
  } catch {
    /* cliente amule temporalmente caído → fallback */
  }
  return null;
}

async function locateGrabbedFile(grab: PostProcessGrab): Promise<LocatedFile | null> {
  switch (grab.service) {
    case "transmission":
    case "direct-plugin":
      return (await locateTransmission(grab)) ?? (await searchByName(grab.release_title));
    case "slskd":
      return (await locateSlskd(grab)) ?? (await searchByName(grab.release_title));
    case "amule":
      return (await locateAmule(grab)) ?? (await searchByName(grab.release_title));
    default:
      return searchByName(grab.release_title); // pyload: buscar por nombre del package
  }
}

// ─── Post-proceso principal (un paso por ciclo) ──────────────────────────────

function rootIsDefault(rootFolder: string | null): boolean {
  const r = (rootFolder || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return !r || r === "home" || r === "downloads";
}

/** ¿Existe una ruta virtual (local o SMB)? */
async function virtualExists(rel: string): Promise<boolean> {
  const r = resolveVirtualPath(rel);
  if (!r) return false;
  if (r.type === "local") return existsSync(r.absPath);
  try {
    return !!(await smbStat(r.config, r.subPath));
  } catch {
    return false;
  }
}

function logGrab(grab: PostProcessGrab, event: string, message: string): void {
  try {
    recordGrabLog({
      subscription_id: grab.subscription_id,
      episode_id: grab.episode_id ?? null,
      movie_id: grab.movie_id ?? null,
      grab_id: grab.id,
      event,
      message,
    });
  } catch {
    /* el log es informativo */
  }
}

function logPlexScan(grab: PostProcessGrab, ctx: string): void {
  logGrab(grab, "postprocess_plex", "rescan de Plex lanzado");
  triggerPlexRefresh(ctx);
}

function triggerPlexRefresh(ctx: string): void {
  void refreshPlexLibraries()
    .then((res) => {
      console.log(
        `[planner] plex scan: ${res.refreshed}/${res.total} librerías re-escaneadas (${ctx})`,
      );
    })
    .catch((err: any) => {
      console.warn(`[planner] plex scan falló (${ctx}): ${err?.message ?? err}`);
    });
}

function setFilePath(
  db: ReturnType<typeof useDatabase>,
  grab: PostProcessGrab,
  path: string,
): void {
  try {
    if (grab.episode_id) {
      db.prepare("UPDATE planner_episodes SET file_path = ? WHERE id = ?").run(path, grab.episode_id);
    }
    if (grab.movie_id) {
      db.prepare("UPDATE planner_movies SET file_path = ? WHERE id = ?").run(path, grab.movie_id);
    }
  } catch {
    /* file_path es informativo */
  }
}

/** Marca el grab como completado: archivo en destino + episodio/película 'downloaded'. */
function finalize(grab: PostProcessGrab, destVirtual: string): void {
  const db = useDatabase();
  const now = new Date().toISOString();
  const plexScan = grab.plex_scan === 1 || grab.plex_scan === true;

  setFilePath(db, grab, destVirtual);
  db.prepare(
    "UPDATE planner_grab_queue SET post_step = 'done', last_error = NULL, move_job_id = NULL WHERE id = ?",
  ).run(grab.id);

  if (grab.episode_id) {
    db.prepare(
      "UPDATE planner_episodes SET status = 'downloaded', downloaded_at = ? WHERE id = ? AND status = 'grabbed'",
    ).run(now, grab.episode_id);
  }
  if (grab.movie_id) {
    db.prepare(
      "UPDATE planner_movies SET status = 'downloaded', downloaded_at = ? WHERE id = ? AND status = 'grabbed'",
    ).run(now, grab.movie_id);
  }

  logGrab(grab, "postprocess_moved", `archivo en destino: '${destVirtual}'`);
  console.log(`[planner] grab #${grab.id}: archivo en destino '${destVirtual}'`);
  if (plexScan) logPlexScan(grab, `grab #${grab.id}`);
}

/** Mapea una fila de la query al tipo PostProcessGrab. */
function toPostProcessGrab(row: Record<string, any>): PostProcessGrab {
  return {
    id: row.id,
    subscription_id: row.subscription_id,
    service: row.service,
    release_hash: row.release_hash ?? null,
    release_title: row.release_title ?? null,
    episode_id: row.episode_id ?? null,
    movie_id: row.movie_id ?? null,
    root_folder: row.root_folder ?? null,
    smart_rename: row.smart_rename ?? 0,
    plex_scan: row.plex_scan ?? 0,
    post_step: row.post_step ?? null,
    located_path: row.located_path ?? null,
    move_job_id: row.move_job_id ?? null,
  };
}

/**
 * Lanza todas las tareas del planificador pendientes, ejecutando UN paso de
 * cada una. Lo llama el importer cada 60 segundos.
 */
export async function runPostProcessTasks(): Promise<void> {
  const db = useDatabase();
  const rows = db
    .prepare(
      `SELECT g.*, s.root_folder, s.smart_rename, s.plex_scan
       FROM planner_grab_queue g
       LEFT JOIN planner_subscriptions s ON s.id = g.subscription_id
       WHERE g.post_step IN ('locate', 'rename', 'move')`,
    )
    .all() as unknown as Array<Record<string, any>>;

  for (const row of rows) {
    const grab = toPostProcessGrab(row);
    try {
      await runPostProcessStep(grab);
    } catch (err: any) {
      console.error(`[planner] post-process step failed for grab #${grab.id}:`, err?.message);
    }
  }
}

/** Ejecuta UN paso del post-proceso de un grab. */
async function runPostProcessStep(grab: PostProcessGrab): Promise<void> {
  const db = useDatabase();
  const smartRename = grab.smart_rename === 1 || grab.smart_rename === true;

  switch (grab.post_step) {
    // 1) ¿Existe el archivo descargado en /downloads?
    case "locate": {
      const located = await locateGrabbedFile(grab);
      if (!located) return; // reintentar el próximo ciclo (el archivo puede tardar)
      db.prepare(
        "UPDATE planner_grab_queue SET located_path = ?, post_step = ? WHERE id = ?",
      ).run(located.virtual, smartRename ? "rename" : "move", grab.id);
      logGrab(
        grab,
        "postprocess_located",
        `archivo localizado: '${located.virtual}' (${grab.service})`,
      );
      return;
    }

    // 2) ¿Aplicar smart rename? (en el sitio)
    case "rename": {
      const virtual = grab.located_path;
      if (!virtual) {
        db.prepare("UPDATE planner_grab_queue SET post_step = 'move' WHERE id = ?").run(grab.id);
        return;
      }
      let newName: string | null = null;
      try {
        newName = await suggestSmartRename(virtual);
      } catch {
        newName = null;
      }
      const current = basename(virtual);
      if (newName && newName !== current) {
        const dir = virtual.slice(0, virtual.lastIndexOf("/") + 1);
        const newVirtual = dir + newName;
        try {
          await movePath(virtual, newVirtual);
          db.prepare(
            "UPDATE planner_grab_queue SET located_path = ?, post_step = 'move' WHERE id = ?",
          ).run(newVirtual, grab.id);
          logGrab(grab, "postprocess_renamed", `renombrado '${current}' → '${newName}'`);
          return;
        } catch (err: any) {
          const msg = `post-process rename: ${err?.message ?? err}`;
          logGrab(grab, "postprocess_failed", msg);
          db.prepare("UPDATE planner_grab_queue SET last_error = ? WHERE id = ?").run(msg, grab.id);
          return; // reintentar el próximo ciclo
        }
      }
      db.prepare("UPDATE planner_grab_queue SET post_step = 'move' WHERE id = ?").run(grab.id);
      return;
    }

    // 3) ¿Ya está en destino o hay que moverlo?
    case "move": {
      const virtual = grab.located_path;
      if (!virtual) {
        db.prepare("UPDATE planner_grab_queue SET post_step = 'done', last_error = 'no located_path' WHERE id = ?").run(grab.id);
        return;
      }

      // Carpeta por defecto: el archivo ya está en su destino.
      if (rootIsDefault(grab.root_folder)) {
        finalize(grab, virtual);
        return;
      }

      const root = (grab.root_folder || "").replace(/^\/+/, "").replace(/\/+$/, "");
      const destDir = root || "downloads";
      const destVirtual = destDir + "/" + basename(virtual);

      // Ya está en destino → listo.
      if (await virtualExists(destVirtual)) {
        finalize(grab, destVirtual);
        return;
      }

      // Ya hay un movimiento activo para este archivo → esperar.
      if (isPathInActiveTransfer(virtual)) return;

      // Encolar el movimiento en la cola del systray (igual que el file manager).
      const jobId = enqueueTransferJob([virtual], destDir, "move");
      db.prepare("UPDATE planner_grab_queue SET move_job_id = ? WHERE id = ?").run(jobId, grab.id);
      logGrab(
        grab,
        "postprocess_move_queued",
        `movimiento encolado '${virtual}' → '${destDir}/' (job ${jobId.slice(0, 8)})`,
      );
      return;
    }

    default:
      return;
  }
}
