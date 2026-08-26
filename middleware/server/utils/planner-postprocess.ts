/**
 * Post-procesado de grabs del planificador (iteración "librarian").
 *
 * Cuando un grab del planificador completa en CUALQUIER red (transmission,
 * slskd, amule, pyload), este módulo:
 *   1. Localiza el archivo descargado en el volumen compartido (/downloads).
 *   2. Lo MUEVE a la carpeta destino (root_folder) de la subscription
 *      (local↔local rename instantáneo, local→SMB upload + delete).
 *   3. Opcionalmente aplica un "smart rename" (formato limpio de episodio
 *      o película) si la subscription tiene `smart_rename` activado.
 *
 * Reutiliza el motor de transferencia compartido (transfer-engine) — el mismo
 * que usa el file manager — para que el comportamiento local/SMB sea idéntico.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { useDatabase } from "./database";
import { getDownloadsRoot } from "./remoteMounts";
import { movePath } from "./transfer-engine";
import { useTransmissionClient } from "./transmission-client";
import { useSlskdClient } from "./slskd-client";
import { useAmuleClient } from "./amule-client";

/** Datos del grab enriquecidos con la subscription (query del importer). */
export interface PostProcessGrab {
  id: number;
  service: string;
  release_hash: string | null;
  release_title: string | null;
  episode_id: number | null;
  movie_id: number | null;
  sub_title: string | null;
  root_folder: string | null;
  smart_rename: number | boolean;
  season_number?: number | null;
  episode_number?: number | null;
  episode_title?: string | null;
  movie_year?: number | null;
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

/** Caracteres inválidos en nombres de archivo Windows/SMB. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
}

// ─── Smart rename ────────────────────────────────────────────────────────────

/** Construye el nombre limpio para el archivo del grab (o null si no aplica). */
export function buildSmartName(grab: PostProcessGrab, baseName: string): string | null {
  const ext = extname(baseName);
  let raw: string | null = null;
  if (grab.episode_id) {
    const s = String(grab.season_number ?? "").padStart(2, "0");
    const e = String(grab.episode_number ?? "").padStart(2, "0");
    const marker = s && e ? `S${s}E${e}` : null;
    if (grab.sub_title && marker) {
      raw = grab.episode_title
        ? `${grab.sub_title} - ${marker} - ${grab.episode_title}`
        : `${grab.sub_title} - ${marker}`;
    }
  } else if (grab.movie_id && grab.sub_title) {
    raw = grab.movie_year ? `${grab.sub_title} (${grab.movie_year})` : grab.sub_title;
  }
  if (!raw) return null;
  const clean = sanitizeFilename(raw);
  if (!clean) return null;
  return clean + ext;
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
      // Match por nombre (includes normalizado)
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
    // Si aMule devuelve solo el nombre (no la ruta), buscar en /downloads
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
      return locateTransmission(grab);
    case "slskd":
      return (await locateSlskd(grab)) ?? (await searchByName(grab.release_title));
    case "amule":
      return (await locateAmule(grab)) ?? (await searchByName(grab.release_title));
    default:
      return searchByName(grab.release_title); // pyload: buscar por nombre del package
  }
}

// ─── Post-proceso principal ──────────────────────────────────────────────────

function rootIsDefault(rootFolder: string | null): boolean {
  const r = (rootFolder || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return !r || r === "home" || r === "downloads";
}

/**
 * Mueve el archivo del grab a la carpeta destino y (si está activado) aplica
 * el smart rename. Actualiza file_path en la BD. Nunca lanza: registra el
 * error en last_error del grab para que sea visible.
 */
export async function postProcessGrab(grab: PostProcessGrab): Promise<void> {
  const db = useDatabase();
  const smartRename = grab.smart_rename === 1 || grab.smart_rename === true;
  const defaultRoot = rootIsDefault(grab.root_folder);
  if (defaultRoot && !smartRename) return; // nada que hacer

  const located = await locateGrabbedFile(grab);
  if (!located) {
    console.warn(
      `[planner] post-proceso grab #${grab.id}: no se localizó el archivo (${grab.service}, '${grab.release_title ?? ""}')`,
    );
    return;
  }

  const newName = smartRename ? buildSmartName(grab, located.name) : null;
  const finalName = newName && newName !== located.name ? newName : null;

  let destVirtual: string;
  if (defaultRoot) {
    // Solo rename en el sitio actual
    destVirtual = finalName
      ? located.virtual.slice(0, located.virtual.lastIndexOf("/") + 1) + finalName
      : located.virtual;
  } else {
    const root = (grab.root_folder || "").replace(/^\/+/, "").replace(/\/+$/, "");
    destVirtual = root + "/" + (finalName ?? located.name);
  }

  if (destVirtual === located.virtual) {
    // El destino no cambia (ni carpeta ni nombre) — solo registrar file_path
    setFilePath(db, grab, located.virtual);
    return;
  }

  try {
    await movePath(located.virtual, destVirtual);
    console.log(
      `[planner] grab #${grab.id}: movido '${located.virtual}' → '${destVirtual}'${newName && newName !== located.name ? " (smart rename)" : ""}`,
    );
    setFilePath(db, grab, destVirtual);
    db.prepare(
      "UPDATE planner_grab_queue SET last_error = NULL WHERE id = ?",
    ).run(grab.id);
  } catch (err: any) {
    const msg = `post-process: ${err?.message ?? err}`;
    db.prepare(
      "UPDATE planner_grab_queue SET last_error = ? WHERE id = ?",
    ).run(msg, grab.id);
    console.error(`[planner] grab #${grab.id}: fallo al mover: ${msg}`);
  }
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