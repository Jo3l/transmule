/**
 * GET /api/planner/subscriptions/:id/episodes?season=1&status=wanted
 *
 * Lista de episodios de una subscription (series).
 */
import { getSubscription, listEpisodes, listSeasons } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "List subscription episodes",
    description: "Returns episodes for a series subscription, optionally filtered.",
    responses: {
      200: { description: "Array of episodes" },
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
  if (sub.type !== "series") {
    setResponseStatus(event, 400);
    return { error: "Subscription is not a series" };
  }

  const q = getQuery(event) as { season?: string; status?: string };
  const seasonNumber = q.season ? Number(q.season) : undefined;
  const status = q.status as any;

  if (seasonNumber !== undefined) {
    return listEpisodes(id, { seasonNumber, status });
  }
  // Sin filtro de season: agrupar por season
  const seasons = listSeasons(id);
  return seasons.map((s) => ({
    ...s,
    episodes: listEpisodes(id, { seasonNumber: s.season_number, status }),
  }));
});
