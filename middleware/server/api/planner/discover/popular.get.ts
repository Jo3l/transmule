/**
 * GET /api/planner/discover/popular?language=es&limit=12
 *
 * Títulos populares de TMDB (series y películas) disponibles para ver en la
 * región (streaming, gratis, con anuncios, alquiler o compra), para alimentar
 * los sliders del dashboard del planificador.
 */
import { discoverTmdbPopular } from "~/services/planner/tmdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Popular movies and series (TMDB discover)",
    description: "Popular movies and TV shows available to watch in the configured region.",
    responses: {
      200: { description: "Popular series and movies" },
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
    discoverTmdbPopular("tv", { language, limit }).catch(() => []),
    discoverTmdbPopular("movie", { language, limit }).catch(() => []),
  ]);

  return { series, movies };
});
