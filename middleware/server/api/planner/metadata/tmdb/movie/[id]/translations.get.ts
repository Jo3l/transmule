/**
 * GET /api/planner/metadata/tmdb/movie/:id/translations
 *
 * Idiomas en los que TMDB tiene la película traducida (título/sinopsis),
 * normalizados a código ISO-2. Alimenta el selector de idioma del planificador
 * al añadir una película.
 */
import { getTmdbMovieTranslations } from "~/services/planner/tmdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "TMDB movie translations",
    description: "Returns the languages TMDB provides translations for.",
    responses: {
      200: { description: "Languages" },
      400: { description: "Invalid id" },
      401: { description: "Auth required" },
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
  try {
    const languages = await getTmdbMovieTranslations(id);
    return { languages };
  } catch {
    // Sin key TMDB o error de red → lista vacía (el selector queda "Cualquiera").
    return { languages: [] };
  }
});
