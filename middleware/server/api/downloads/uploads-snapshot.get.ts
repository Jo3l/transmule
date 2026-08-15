import { getUnifiedUploadsPayload } from "../amule/uploads.get";
import { getSlskdTransfersPayload } from "../slskd/transfers.get";
import { getSpeedHistory } from "../../utils/speedHistory";

defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Unified uploads snapshot across all services",
    description:
      "Single round-trip: peers downloading from us (aMule + Transmission via " +
      "the amule/uploads aggregator), slskd upload transfers, and speed history. " +
      "Per-service failures are isolated under each key.",
    responses: {
      200: { description: "Per-service snapshot" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const result: Record<string, any> = {};

  await Promise.all([
    // aMule + Transmission upload peers (already aggregated server-side)
    getUnifiedUploadsPayload()
      .then((r) => (result.uploads = r))
      .catch((err: any) => (result.uploads = { error: err?.message ?? "uploads error" })),

    // slskd upload transfers (flat list)
    getSlskdTransfersPayload("upload", false)
      .then((r) => (result.slskdUploads = r))
      .catch((err: any) => (result.slskdUploads = { error: err?.message ?? "slskd error" })),

    Promise.resolve()
      .then(() => (result.speedHistory = getSpeedHistory()))
      .catch(() => (result.speedHistory = [])),
  ]);

  return result;
});
