import { hexToHash } from "../../utils/amule-client";
import { cancelSlskdTransferGroup } from "../../utils/slskd-cancel";

defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Unified cancel across download services",
    description:
      "Cancels/removes items from any combination of services (amule, torrent, " +
      "pyload, slskd) in a single request. The middleware dispatches each batch " +
      "to its service internally — including fanning out per-file slskd deletes " +
      "server-side — so the frontend is network-agnostic.",
    responses: {
      200: { description: "Per-service results" },
      400: { description: "Invalid request body" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const removeData = body?.removeData === true;

  const amuleHashes: string[] = Array.isArray(body?.amule?.hashes)
    ? body.amule.hashes.filter((h: any) => typeof h === "string" && h)
    : [];
  const torrentIds: (number | string)[] = Array.isArray(body?.torrent?.ids)
    ? body.torrent.ids
    : [];
  const pyloadPids: number[] = Array.isArray(body?.pyload?.pids)
    ? body.pyload.pids.map((p: any) => Number(p)).filter((p: number) => !Number.isNaN(p))
    : [];
  const slskdGroups: { username: string; directory?: string }[] = Array.isArray(
    body?.slskd?.groups,
  )
    ? body.slskd.groups.filter(
        (g: any) => typeof g?.username === "string" && g.username,
      )
    : [];

  if (
    amuleHashes.length === 0 &&
    torrentIds.length === 0 &&
    pyloadPids.length === 0 &&
    slskdGroups.length === 0
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "at least one service batch is required",
    });
  }

  const results: Record<string, any> = {};

  // ── aMule ─────────────────────────────────────────────────────────────
  if (amuleHashes.length) {
    results.amule = await (async () => {
      const client = useAmuleClient();
      const settled = await Promise.allSettled(
        amuleHashes.map((h) => client.deleteDownload(hexToHash(h))),
      );
      const failed = settled.filter((r) => r.status === "rejected").length;
      return { requested: amuleHashes.length, failed };
    })().catch((err: any) => ({ error: err?.message ?? "amule error" }));
  }

  // ── Transmission ──────────────────────────────────────────────────────
  if (torrentIds.length) {
    results.torrent = await (async () => {
      const client = useTransmissionClient();
      await client.removeTorrents(torrentIds, removeData);
      return { requested: torrentIds.length, failed: 0 };
    })().catch((err: any) => ({ error: err?.message ?? "transmission error" }));
  }

  // ── pyLoad ────────────────────────────────────────────────────────────
  if (pyloadPids.length) {
    results.pyload = await (async () => {
      const client = usePyLoadClient();
      await client.deletePackages(pyloadPids);
      return { requested: pyloadPids.length, failed: 0 };
    })().catch((err: any) => ({ error: err?.message ?? "pyload error" }));
  }

  // ── slskd (per-group server-side fan-out) ─────────────────────────────
  if (slskdGroups.length) {
    results.slskd = await (async () => {
      const client = useSlskdClient();
      let matched = 0;
      let cancelled = 0;
      for (const g of slskdGroups) {
        const r = await cancelSlskdTransferGroup(client, {
          username: g.username,
          directory: g.directory,
          remove: true,
        });
        matched += r.matched;
        cancelled += r.cancelled;
      }
      return { matched, cancelled };
    })().catch((err: any) => ({ error: err?.message ?? "slskd error" }));
  }

  console.log(
    `[downloads] unified cancel: amule=${amuleHashes.length} torrent=${torrentIds.length} pyload=${pyloadPids.length} slskdGroups=${slskdGroups.length}`,
  );

  return { success: true, results };
});
