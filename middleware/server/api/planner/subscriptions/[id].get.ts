/**
 * GET /api/planner/subscriptions/:id
 *
 * Detalle de una subscription (con seasons/episodes o movie si aplica).
 */
import {
  getSubscription,
  listSeasons,
  listEpisodes,
  getMovieBySubscription,
} from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Subscription detail",
    description: "Returns a subscription with its seasons/episodes or movie data.",
    responses: {
      200: { description: "Subscription detail" },
      401: { description: "Auth required" },
      404: { description: "Not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const id = Number(getRouterParam(event, "id"));
  if (!Number.isFinite(id)) {
    setResponseStatus(event, 400);
    return { error: "Invalid id" };
  }
  const sub = getSubscription(id);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }

  const detail: Record<string, unknown> = { ...sub };
  if (sub.type === "series") {
    const seasons = listSeasons(id);
    detail.seasons = seasons.map((s) => ({
      ...s,
      episodes: listEpisodes(id, { seasonNumber: s.season_number }),
    }));
  } else {
    detail.movie = getMovieBySubscription(id) ?? null;
  }
  return detail;
});
