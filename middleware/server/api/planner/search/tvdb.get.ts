/**
 * GET /api/planner/search/tvdb?q=breaking&year=2008
 *
 * Busca series en TVDB (con caché SQLite).
 */
import { searchTvdb } from "~/services/planner/tvdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Search TVDB",
    description: "Searches TV shows on TVDB.",
    responses: {
      200: { description: "Array of results" },
      400: { description: "Missing query" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as { q?: string; year?: string; type?: string };
  if (!q.q?.trim()) {
    setResponseStatus(event, 400);
    return { error: "Query param 'q' is required" };
  }
  const year = q.year ? Number(q.year) : undefined;
  const type = q.type === "movie" ? "movie" : "series";
  const results = await searchTvdb(q.q.trim(), { year, type });
  return { results };
});
