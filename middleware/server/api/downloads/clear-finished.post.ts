import { hexToHash, fileStatusLabel } from "../../utils/amule-client";

defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Clear finished downloads across all services",
    description:
      "Removes completed/finished items from every service (amule, torrent, " +
      "pyload, slskd) in a single request. The middleware queries each service, " +
      "decides what counts as finished, and clears it — the frontend sends no " +
      "per-service payloads.",
    responses: {
      200: { description: "Per-service clear results" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const results: Record<string, any> = {};

  // ── aMule: delete downloads whose EC status maps to "Complete" ────────
  results.amule = await (async () => {
    const client = useAmuleClient();
    const queue = await client.getDownloadQueue();
    const done = (queue ?? []).filter(
      (f: any) => fileStatusLabel(f.fileStatus, f.stopped) === "Complete",
    );
    const settled = await Promise.allSettled(
      done.map((f: any) =>
        client.deleteDownload(hexToHash(f.fileHashHexString)),
      ),
    );
    const failed = settled.filter((r) => r.status === "rejected").length;
    return { cleared: done.length - failed, failed };
  })().catch((err: any) => ({ error: err?.message ?? "amule error" }));

  // ── Transmission: remove torrents at 100% (keep data) ─────────────────
  results.torrent = await (async () => {
    const client = useTransmissionClient();
    const torrents = await client.getTorrents();
    const ids = (torrents ?? [])
      .filter((t: any) => (t.percentDone ?? 0) >= 1)
      .map((t: any) => t.id);
    if (ids.length) await client.removeTorrents(ids, false);
    return { cleared: ids.length, failed: 0 };
  })().catch((err: any) => ({ error: err?.message ?? "transmission error" }));

  // ── pyLoad: delete packages with no unfinished links ──────────────────
  results.pyload = await (async () => {
    const client = usePyLoadClient();
    const [queue, collector] = await Promise.all([
      client.getQueue().catch(() => []),
      client.getCollector().catch(() => []),
    ]);
    // pyLoad link statuses (LINK_STATUS in packages.get.ts):
    //   0 Finished, 1 Offline, 4 Skipped, 8 Failed  → terminal states
    //   everything else (2 Online, 3 Queued, 5 Waiting, 6 Temp Offline,
    //   7 Starting, 9 Aborted, 10 Decrypting, 11 Custom, 12 Downloading,
    //   13 Processing, 14 Unknown) → still unfinished.
    const TERMINAL = new Set([0, 1, 4, 8]);
    const pids = [...(queue ?? []), ...(collector ?? [])]
      .filter((p: any) => {
        const links = p.links ?? [];
        if (links.length === 0) return false;
        return links.every((l: any) => TERMINAL.has(l.status));
      })
      .map((p: any) => p.pid);
    if (pids.length) await client.deletePackages(pids);
    return { cleared: pids.length, failed: 0 };
  })().catch((err: any) => ({ error: err?.message ?? "pyload error" }));

  // ── slskd: native bulk endpoint removes all completed downloads ────────
  results.slskd = await (async () => {
    const client = useSlskdClient();
    const ok = await client.clearCompletedDownloads();
    return { cleared: ok ? "all" : 0, failed: ok ? 0 : 1 };
  })().catch((err: any) => ({ error: err?.message ?? "slskd error" }));

  console.log(
    `[downloads] clear finished: amule=${JSON.stringify(results.amule)} torrent=${JSON.stringify(results.torrent)} pyload=${JSON.stringify(results.pyload)} slskd=${JSON.stringify(results.slskd)}`,
  );

  return { success: true, results };
});
