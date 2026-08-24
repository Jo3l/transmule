/**
 * POST /api/planner/subscriptions/:id/seasons/:sid/download
 *
 * "Descargar temporada": busca y añade a descarga automáticamente todos los
 * episodios ya emitidos de la temporada. Corre en background.
 */
import { getSubscription, listSeasons } from "~/utils/planner-db";
import { searchAndGrabSeason } from "~/plugins/planner-scheduler";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Download season",
    description:
      "Automatically searches and enqueues downloads for all aired episodes of a season.",
    responses: {
      200: { description: "Season download started" },
      401: { description: "Auth required" },
      404: { description: "Not found" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  const subId = Number(getRouterParam(event, "id"));
  const seasonId = Number(getRouterParam(event, "sid"));
  if (!Number.isFinite(subId) || !Number.isFinite(seasonId)) {
    setResponseStatus(event, 400);
    return { error: "Invalid id" };
  }
  const sub = getSubscription(subId);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }
  const season = listSeasons(subId).find((s) => s.id === seasonId);
  if (!season) {
    setResponseStatus(event, 404);
    return { error: "Season not found" };
  }

  searchAndGrabSeason(subId, season.season_number).catch((err: any) => {
    console.error("[planner] season download error:", err?.message ?? err);
  });
  return { ok: true, started: true };
});
