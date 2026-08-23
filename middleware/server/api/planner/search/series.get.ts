/**
 * GET /api/planner/search/series?q=...
 *
 * Búsqueda unificada de series: TVDB primero; si no hay TVDB configurada,
 * fallback a TMDB. Devuelve `source` para que el frontend sepa si el id del
 * resultado es un tvdb_id ("tvdb") o un tmdb_id ("tmdb").
 */
import { searchTvdb, getTvdbKey } from "~/services/planner/tvdb";
import { searchTmdb } from "~/services/planner/tmdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Search series (TVDB with TMDB fallback)",
    description: "Searches series on TVDB, falling back to TMDB when no TVDB key.",
    responses: {
      200: { description: "Results + source" },
      400: { description: "Missing query" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as { q?: string; year?: string };
  if (!q.q?.trim()) {
    setResponseStatus(event, 400);
    return { error: "Query param 'q' is required" };
  }
  const year = q.year ? Number(q.year) : undefined;

  if (getTvdbKey()) {
    const results = await searchTvdb(q.q.trim(), { year, type: "series" });
    return { source: "tvdb", results };
  }

  const results = await searchTmdb(q.q.trim(), { type: "tv", year });
  return { source: "tmdb", results };
});
