/**
 * Speed poller plugin — runs on Nitro startup.
 * Polls each service every 3 seconds and stores a data point in the
 * in-memory ring buffer (server/utils/speedHistory.ts).
 * This keeps 15 minutes of history alive server-side, independent of
 * any frontend session.
 */

import { pushSpeedPoint } from "../utils/speedHistory";
import { useAmuleClient } from "../utils/amule-client";
import { useTransmissionClient } from "../utils/transmission-client";
import { usePyLoadClient } from "../utils/pyload-client";

export default defineNitroPlugin(() => {
  async function poll() {
    let amule = 0;
    let torrent = 0;
    let pyload = 0;

    // ── aMule ──────────────────────────────────────────────────────────────
    try {
      const client = useAmuleClient();
      const queue = await client.getDownloadQueue();
      amule = queue.reduce((s: number, f: any) => s + (f.speed || 0), 0);
    } catch {
      /* service unavailable — keep 0 */
    }

    // ── Transmission ───────────────────────────────────────────────────────
    try {
      const client = useTransmissionClient();
      const torrents = await client.getTorrents();
      torrent = torrents.reduce(
        (s: number, t: any) => s + (t.rateDownload || 0),
        0,
      );
    } catch {
      /* service unavailable — keep 0 */
    }

    // ── pyLoad ─────────────────────────────────────────────────────────────
    try {
      const client = usePyLoadClient();
      const active = await client.getActiveDownloads();
      pyload = active.reduce((s: number, d: any) => s + (d.speed || 0), 0);
    } catch {
      /* service unavailable — keep 0 */
    }

    pushSpeedPoint({ t: Date.now(), amule, torrent, pyload });
  }

  // Initial sample immediately, then every 3 s
  poll();
  setInterval(poll, 3000);
});
