/**
 * GET /api/planner/discover/popular?language=es&limit=12
 *
 * Sliders del dashboard del planificador:
 *   - series: tendencias de la semana en TMDB (solo series de ficción, sin
 *     informativos/realities/talk shows).
 *   - movies: películas populares disponibles para ver en la región
 *     (streaming, gratis, con anuncios, alquiler o compra).
 */
import { discoverTmdbPopular, discoverTmdbTrendingTv } from "~/services/planner/tmdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Trending series and popular movies (TMDB)",
    description:
      "Series trending this week (scripted only) and popular movies available in the configured region.",
    responses: {
      200: { description: "Trending series and popular movies" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as { language?: string; limit?: string };
  const language = q.language?.trim() || undefined;
  const limitRaw = Number(q.limit);
  const limit = q.limit && Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const [series, movies] = await Promise.all([
    discoverTmdbTrendingTv({ language, limit }).catch(() => []),
    discoverTmdbPopular("movie", { language, limit }).catch(() => []),
  ]);

  return { series, movies };
});
