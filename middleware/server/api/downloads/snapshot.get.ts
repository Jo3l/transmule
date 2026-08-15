import { getAmuleDownloadsPayload } from "../amule/downloads.get";
import { getTransmissionTorrentsPayload } from "../transmission/torrents.get";
import { getPyloadPackagesPayload } from "../pyload/packages.get";
import { getSlskdTransfersPayload } from "../slskd/transfers.get";
import { getSpeedHistory } from "../../utils/speedHistory";

defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Unified downloads snapshot across all services",
    description:
      "Single round-trip that fans out server-side to every download service " +
      "(amule, torrent, pyload, slskd) plus speed history, reusing each " +
      "service's own payload builder. Per-service failures are isolated " +
      "(error string under that key) so one dead service never breaks the " +
      "snapshot.",
    responses: {
      200: { description: "Per-service snapshot" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const result: Record<string, any> = {};

  await Promise.all([
    getAmuleDownloadsPayload()
      .then((r) => (result.amule = r))
      .catch((err: any) => (result.amule = { error: err?.message ?? "amule error" })),

    getTransmissionTorrentsPayload()
      .then((r) => (result.torrent = r))
      .catch((err: any) => (result.torrent = { error: err?.message ?? "transmission error" })),

    getPyloadPackagesPayload()
      .then((r) => (result.pyload = r))
      .catch((err: any) => (result.pyload = { error: err?.message ?? "pyload error" })),

    getSlskdTransfersPayload("download", true)
      .then((r) => (result.slskd = r))
      .catch((err: any) => (result.slskd = { error: err?.message ?? "slskd error" })),

    Promise.resolve()
      .then(() => (result.speedHistory = getSpeedHistory()))
      .catch(() => (result.speedHistory = [])),
  ]);

  return result;
});
