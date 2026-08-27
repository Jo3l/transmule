/**
 * GET /api/plex/library/episodes?series=<título>&force=1
 *
 * Episodios existentes en Plex para una serie concreta (p.ej. "Silo").
 * Devuelve `episodes` como array de "season-episode" ("3-8"). Cache 10 min.
 *
 * El detalle de serie del planificador lo usa para marcar con un check los
 * episodios que ya están en Plex (columna "Plex", visible solo con la
 * integración configurada).
 */
import { getPlexCredentials, getPlexSeriesEpisodes } from "~/services/plex";

defineRouteMeta({
  openAPI: {
    tags: ["Plex"],
    summary: "Plex series episodes",
    description: "Episodios existentes de una serie en Plex (season-episode).",
    responses: {
      200: { description: "Episodes" },
      400: { description: "series required" },
      401: { description: "Auth required" },
      502: { description: "Plex connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  if (!getPlexCredentials()) {
    return { configured: false, found: false, episodes: [] };
  }

  const series = String(getQuery(event).series ?? "").trim();
  if (!series) {
    setResponseStatus(event, 400);
    return { error: "series required" };
  }

  const force = getQuery(event).force === "1";
  try {
    const res = await getPlexSeriesEpisodes(series, force);
    return {
      configured: true,
      found: res?.found ?? false,
      episodes: res?.episodes ?? [],
    };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Plex: ${err?.message ?? err}`,
    });
  }
});