/**
 * GET /api/planner/metadata/tmdb/movie/:id
 *
 * Detalle de película TMDB + release dates (Digital/theatrical).
 */
import { getTmdbMovieDetail, getTmdbMovieReleaseDates } from "~/services/planner/tmdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "TMDB movie detail",
    description: "Returns TMDB movie detail + release dates.",
    responses: {
      200: { description: "Movie detail" },
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
  const movie = await getTmdbMovieDetail(id);
  if (!movie) {
    setResponseStatus(event, 404);
    return { error: "Movie not found" };
  }
  const releaseDates = await getTmdbMovieReleaseDates(id).catch(() => ({
    digital: null,
    theatrical: null,
  }));
  return { ...movie, release_dates: releaseDates };
});
