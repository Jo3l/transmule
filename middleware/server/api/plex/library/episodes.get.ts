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
import { getTvdbSeriesDetail } from "~/services/planner/tvdb";
import { getTmdbTvDetail } from "~/services/planner/tmdb";

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

  // Candidatos de título: el localizado (lo que muestra TransMule) y, si viene
  // identificador y hay idioma seleccionado, el ORIGINAL desde TVDB/TMDB.
  // Plex tiene la serie localizada en unos casos y en el original en otros,
  // así que se prueban ambos.
  const tvdbId = Number(getQuery(event).tvdb_id);
  const tmdbId = Number(getQuery(event).tmdb_id);
  const language = String(getQuery(event).language ?? "").trim();
  const candidates: string[] = [series];
  if ((Number.isFinite(tvdbId) || Number.isFinite(tmdbId)) && language && language !== "en") {
    try {
      if (Number.isFinite(tvdbId)) {
        const d = await getTvdbSeriesDetail(tvdbId);
        if (d?.name) candidates.push(d.name);
      } else {
        const d = await getTmdbTvDetail(tmdbId);
        if (d?.name) candidates.push(d.name);
      }
    } catch {
      /* sin título original → probamos solo el localizado */
    }
  }

  const force = getQuery(event).force === "1";
  try {
    const res = await getPlexSeriesEpisodes([...new Set(candidates)], force);
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