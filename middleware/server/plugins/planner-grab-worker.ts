/**
 * Planner grab worker — despacha los grabs pendientes a los download clients.
 *
 * Cada 30s:
 *   1. SELECT * FROM planner_grab_queue WHERE state='pending' LIMIT 5
 *   2. Para cada grab: enviar URL al servicio correspondiente
 *      (transmission → magnet, amule → ed2k, slskd → slskd://, pyload → http)
 *   3. state='dispatched' o 'failed'
 *
 * Usa los endpoints internos del middleware (download dispatch) — nunca
 * habla directo con los servicios, pasando por la capa de TransMule.
 */

import { nextPendingGrabs, updateGrabState, recordGrabLog } from "../utils/planner-db";
import { useTransmissionClient } from "../utils/transmission-client";
import { useAmuleClient } from "../utils/amule-client";
import { useSlskdClient } from "../utils/slskd-client";
import { usePyLoadClient } from "../utils/pyload-client";
import { resolveVirtualPath } from "~/utils/remoteMounts";

const GUARD_KEY = "__transmule_planner_grab_worker_started__";
const INTERVAL_MS = 30_000;
const MAX_BATCH = 5;

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  setInterval(processQueue, INTERVAL_MS);
  console.log("[planner] grab worker started (every 30s)");
});

async function processQueue(): Promise<void> {
  const grabs = nextPendingGrabs(MAX_BATCH);
  for (const grab of grabs) {
    try {
      await dispatch(grab);
      updateGrabState(grab.id, "dispatched");
      recordGrabLog({
        subscription_id: grab.subscription_id,
        episode_id: grab.episode_id ?? null,
        movie_id: grab.movie_id ?? null,
        grab_id: grab.id,
        event: "dispatched",
        message: `enviado a ${grab.service}: ${grab.release_title ?? grab.release_url.slice(0, 60)}`,
      });
      console.log(`[planner] grab #${grab.id} dispatched → ${grab.service}: ${grab.release_title ?? grab.release_url.slice(0, 60)}`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      updateGrabState(grab.id, "failed", msg);
      recordGrabLog({
        subscription_id: grab.subscription_id,
        episode_id: grab.episode_id ?? null,
        movie_id: grab.movie_id ?? null,
        grab_id: grab.id,
        event: "dispatch_failed",
        message: msg,
      });
      console.error(`[planner] grab #${grab.id} failed:`, err?.message);
    }
  }
}

async function dispatch(grab: any): Promise<void> {
  const url = grab.release_url;

  switch (grab.service) {
    case "transmission":
    case "direct-plugin": {
      const client = useTransmissionClient();
      // Carpeta destino de la subscription (root_folder). Transmission la
      // crea si no existe. undefined → directorio por defecto del cliente.
      const downloadDir = resolvePlannerDest(grab.root_folder);
      if (downloadDir && grab.root_folder?.startsWith("home") === false && grab.root_folder?.startsWith("/") === false) {
        console.warn(
          `[planner] grab #${grab.id}: destino SMB '${grab.root_folder}' — el cliente debe tener el montaje visible en '${downloadDir}'`,
        );
      }
      const added = await client.addTorrent({ filename: url, downloadDir });
      if (!added) throw new Error("transmission addTorrent returned false");
      return;
    }
    case "amule": {
      const client = useAmuleClient();
      await client.downloadEd2kLink(url);
      return;
    }
    case "slskd": {
      // slskd://username/filename — añadir a la cola de descargas
      const client = useSlskdClient();
      const parsed = parseSlskdUrl(url);
      if (!parsed) throw new Error(`invalid slskd url: ${url}`);
      const res = await client.enqueueDownloadBatch(parsed.username, [
        { filename: parsed.filename, size: grab.release_size_mb ? grab.release_size_mb * 1024 * 1024 : 0 },
      ]);
      if (!res?.success) throw new Error(`slskd enqueue failed: ${res?.status}`);
      return;
    }
    case "pyload": {
      const client = usePyLoadClient();
      await client.addPackage(
        grab.release_title ?? "planner-download",
        [url],
      );
      return;
    }
    default:
      throw new Error(`unknown service: ${grab.service}`);
  }
}

/**
 * Convierte el root_folder virtual de la subscription a un directorio real
 * dentro del contenedor del cliente de descarga.
 *
 *   - "home" / "home/…"        → ruta local del volumen compartido (/downloads)
 *   - "/downloads/…" (legacy)   → passthrough (mismo volumen)
 *   - "<share>/…" (SMB)         → "/<share>/…" best-effort: solo funciona si el
 *                                contenedor del cliente tiene ese share montado
 *                                en esa ruta (la arquitectura smbclient no puede
 *                                escribir en SMB directamente).
 *
 * undefined → el cliente usa su directorio por defecto.
 */
function resolvePlannerDest(rootFolder: string | null | undefined): string | undefined {
  if (!rootFolder) return undefined;
  const clean = String(rootFolder)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!clean || clean === "downloads" || clean === "home") return undefined;
  if (clean.startsWith("home/")) {
    const r = resolveVirtualPath(clean);
    return r?.type === "local" ? r.absPath : undefined;
  }
  if (clean.startsWith("downloads/")) return "/" + clean;
  // share SMB u otra ruta → passthrough (montaje requerido en el cliente)
  return "/" + clean;
}

function parseSlskdUrl(url: string): { username: string; filename: string } | null {
  const m = url.match(/^slskd:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { username: decodeURIComponent(m[1]), filename: decodeURIComponent(m[2]) };
}
