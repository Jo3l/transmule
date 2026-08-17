/**
 * GET /api/planner/search/tmdb?q=inception&type=movie&year=2010
 *
 * Busca películas/series en TMDB (con caché SQLite).
 */
import { searchTmdb } from "~/services/planner/tmdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Search TMDB",
    description: "Searches movies or TV shows on TMDB.",
    responses: {
      200: { description: "Array of results" },
      400: { description: "Missing query" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as { q?: string; type?: string; year?: string; page?: string };
  if (!q.q?.trim()) {
    setResponseStatus(event, 400);
    return { error: "Query param 'q' is required" };
  }
  const type = q.type === "tv" ? "tv" : "movie";
  const year = q.year ? Number(q.year) : undefined;
  const page = q.page ? Number(q.page) : undefined;
  const results = await searchTmdb(q.q.trim(), { type, year, page });
  return { results };
});
