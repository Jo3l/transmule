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

import { nextPendingGrabs, updateGrabState } from "../utils/planner-db";
import { useTransmissionClient } from "../utils/transmission-client";
import { useAmuleClient } from "../utils/amule-client";
import { useSlskdClient } from "../utils/slskd-client";
import { usePyLoadClient } from "../utils/pyload-client";

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
      console.log(`[planner] grab #${grab.id} dispatched → ${grab.service}: ${grab.release_title ?? grab.release_url.slice(0, 60)}`);
    } catch (err: any) {
      updateGrabState(grab.id, "failed", err?.message ?? String(err));
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
      const added = await client.addTorrent({ filename: url });
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

function parseSlskdUrl(url: string): { username: string; filename: string } | null {
  const m = url.match(/^slskd:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { username: decodeURIComponent(m[1]), filename: decodeURIComponent(m[2]) };
}
