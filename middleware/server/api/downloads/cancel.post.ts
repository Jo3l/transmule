import { hexToHash } from "../../utils/amule-client";
import { cancelSlskdTransferGroup } from "../../utils/slskd-cancel";
import { cancelPlannerGrabs, type PlannerCancelTarget } from "../../utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Unified cancel across download services",
    description:
      "Cancels/removes items from any combination of services (amule, torrent, " +
      "pyload, slskd) in a single request. The middleware dispatches each batch " +
      "to its service internally — including fanning out per-file slskd deletes " +
      "server-side — so the frontend is network-agnostic. When a cancelled item " +
      "originated from the planner, its grab is also cancelled and the episode/" +
      "movie is released back to its pre-download state (unless another active " +
      "grab still points at the same episode/movie).",
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

  // Targets para liberar los grabs del planificador vinculados a lo cancelado.
  const plannerTargets: PlannerCancelTarget[] = [];

  // ── aMule ─────────────────────────────────────────────────────────────
  if (amuleHashes.length) {
    results.amule = await (async () => {
      const client = useAmuleClient();
      const settled = await Promise.allSettled(
        amuleHashes.map((h) => client.deleteDownload(hexToHash(h))),
      );
      const failed = settled.filter((r) => r.status === "rejected").length;
      for (const h of amuleHashes) {
        plannerTargets.push({ service: "amule", hash: h });
      }
      return { requested: amuleHashes.length, failed };
    })().catch((err: any) => ({ error: err?.message ?? "amule error" }));
  }

  // ── Transmission ──────────────────────────────────────────────────────
  if (torrentIds.length) {
    results.torrent = await (async () => {
      const client = useTransmissionClient();
      // Resolver id → hashString ANTES de eliminar, para poder vincular el grab.
      let torrents: any[] = [];
      try {
        torrents = await client.getTorrents();
      } catch {
        /* si no se puede listar, se intenta cancelar igualmente sin vincular */
      }
      const idToHash = new Map<string, string>();
      for (const t of torrents) {
        const id = String(t.id ?? "");
        const hs = String(t.hashString ?? t.hash ?? "");
        if (id && hs) idToHash.set(id, hs);
      }
      for (const idRaw of torrentIds) {
        const id = String(idRaw);
        const hs = idToHash.get(id);
        if (hs) plannerTargets.push({ service: "transmission", hash: hs });
      }
      await client.removeTorrents(torrentIds, removeData);
      return { requested: torrentIds.length, failed: 0 };
    })().catch((err: any) => ({ error: err?.message ?? "transmission error" }));
  }

  // ── pyLoad ────────────────────────────────────────────────────────────
  if (pyloadPids.length) {
    results.pyload = await (async () => {
      const client = usePyLoadClient();
      // Resolver pid → nombre de package ANTES de eliminar.
      let packages: any[] = [];
      try {
        packages = (await client.getQueue()).concat(await client.getCollector());
      } catch {
        packages = [];
      }
      for (const pid of pyloadPids) {
        const pkg = packages.find((p: any) => Number(p.pid) === pid);
        plannerTargets.push({ service: "pyload", title: pkg?.name ?? null });
      }
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
      // Resolver username+directory → títulos de archivo antes de cancelar.
      let grouped: any[] = [];
      try {
        grouped = await client.getTransfersGrouped("download");
      } catch {
        grouped = [];
      }
      const normDir = (d: string) => d.replace(/\\/g, "/").replace(/\/+$/, "");
      const basename = (p: string) => {
        const c = p.replace(/\\/g, "/");
        return c.slice(c.lastIndexOf("/") + 1);
      };
      for (const g of slskdGroups) {
        const parent = normDir(g.directory ?? "");
        const userGrp = grouped.find((ug: any) => ug.username === g.username);
        if (userGrp) {
          for (const dir of userGrp.directories ?? []) {
            const dirPath = normDir(dir.directory ?? "");
            const inScope = parent ? dirPath === parent || dirPath.startsWith(parent + "/") : true;
            if (!inScope) continue;
            for (const file of dir.files ?? []) {
              const fn = String(file.filename ?? "");
              if (!fn) continue;
              plannerTargets.push({
                service: "slskd",
                title: basename(fn),
                username: g.username,
              });
            }
          }
        }
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

  // ── Vincular al planificador: cancelar grabs y liberar episodios/películas ──
  let planner: { cancelled: number; releasedEpisodes: number; releasedMovies: number } | null = null;
  try {
    planner = cancelPlannerGrabs(plannerTargets);
  } catch (err: any) {
    console.error("[downloads] planner grab cancel failed:", err?.message);
  }

  console.log(
    `[downloads] unified cancel: amule=${amuleHashes.length} torrent=${torrentIds.length} pyload=${pyloadPids.length} slskdGroups=${slskdGroups.length}` +
      (planner ? ` plannerCancelled=${planner.cancelled} releasedEpisodes=${planner.releasedEpisodes} releasedMovies=${planner.releasedMovies}` : ""),
  );

  return { success: true, results, planner };
});
