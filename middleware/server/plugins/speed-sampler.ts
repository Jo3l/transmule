/**
 * Background speed sampler plugin.
 *
 * Polls each download service every 3 seconds and records speed data points
 * so the SpeedGraph stays up to date even when no browser tab is on the
 * downloads page.
 *
 * Uses globalThis to guard against re-registration on Nitro HMR reloads.
 */
import {
  updateServiceSpeed,
  updateServiceUploadSpeed,
} from "../utils/speedHistory";
import { useAmuleClient } from "../utils/amule-client";
import { useTransmissionClient } from "../utils/transmission-client";
import { usePyLoadClient } from "../utils/pyload-client";

const INTERVAL_MS = 3000;
const GUARD_KEY = "__transmule_speed_sampler_started__";

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  setInterval(async () => {
    // ── aMule ─────────────────────────────────────────────────────────────
    try {
      const client = useAmuleClient();
      const queue = await client.getDownloadQueue();
      const totalSpeed = queue.reduce((s, f) => s + (f.speed ?? 0), 0);
      updateServiceSpeed("amule", totalSpeed);
    } catch {
      updateServiceSpeed("amule", 0);
    }

    // ── Transmission ──────────────────────────────────────────────────────
    try {
      const client = useTransmissionClient();
      const torrents = await client.getTorrents();
      let totalDown = 0;
      let totalUp = 0;
      for (const t of torrents) {
        totalDown += t.rateDownload ?? 0;
        totalUp += t.rateUpload ?? 0;
      }
      updateServiceSpeed("torrent", totalDown);
      updateServiceUploadSpeed("torrent", totalUp);
    } catch {
      updateServiceSpeed("torrent", 0);
    }

    // ── pyLoad ────────────────────────────────────────────────────────────
    try {
      const client = usePyLoadClient();
      const active = await client.getActiveDownloads();
      const totalSpeed = active.reduce((s, d) => s + (d.speed ?? 0), 0);
      updateServiceSpeed("pyload", totalSpeed);
    } catch {
      updateServiceSpeed("pyload", 0);
    }
  }, INTERVAL_MS);
});
