/**
 * GET /api/planner/metadata/tvdb/series/:id/episodes?season=1
 *
 * Lista de episodios de una serie TVDB (opcional filtro por season).
 */
import { getTvdbSeriesEpisodes } from "~/services/planner/tvdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "TVDB series episodes",
    description: "Returns episodes for a TVDB series, optionally filtered by season.",
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
  const q = getQuery(event) as { season?: string };
  const seasonNumber = q.season ? Number(q.season) : undefined;
  const episodes = await getTvdbSeriesEpisodes(id, seasonNumber);
  return { episodes };
});
