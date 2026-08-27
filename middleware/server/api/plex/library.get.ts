/**
 * GET /api/plex/library
 *
 * Títulos (normalizados en minúsculas, sin no-alfanuméricos) de las
 * bibliotecas de películas y series del servidor Plex configurado en
 * Settings → Integraciones. Cache de 10 min en memoria; ?force=1 recarga.
 *
 * El planificador lo usa para marcar con un tag [plex] las series/películas
 * que ya existen en el servidor.
 */
import { getPlexCredentials, getPlexLibraryTitles } from "~/services/plex";

defineRouteMeta({
  openAPI: {
    tags: ["Plex"],
    summary: "Plex library titles",
    description: "Películas y series existentes en Plex (títulos normalizados).",
    responses: {
      200: { description: "Titles" },
      401: { description: "Auth required" },
      502: { description: "Plex connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  if (!getPlexCredentials()) {
    return { configured: false, movies: [], shows: [] };
  }

  const force = getQuery(event).force === "1";
  try {
    const lib = await getPlexLibraryTitles(force);
    return { configured: true, movies: lib.movies, shows: lib.shows };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Plex: ${err?.message ?? err}`,
    });
  }
});