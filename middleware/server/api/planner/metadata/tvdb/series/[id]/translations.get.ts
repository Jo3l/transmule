/**
 * GET /api/planner/metadata/tvdb/series/:id/translations
 *
 * Idiomas en los que TVDB tiene traducido el NOMBRE de la serie (nameTranslations),
 * normalizados a código ISO-2. Alimenta el selector de idioma del planificador
 * al añadir una serie.
 */
import { getTvdbSeriesTranslations } from "~/services/planner/tvdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "TVDB series name translations",
    description: "Returns the languages TVDB provides name translations for.",
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
    const languages = await getTvdbSeriesTranslations(id);
    return { languages };
  } catch {
    // Sin key TVDB o error de red → devolver lista vacía (el selector queda "Cualquiera").
    return { languages: [] };
  }
});
