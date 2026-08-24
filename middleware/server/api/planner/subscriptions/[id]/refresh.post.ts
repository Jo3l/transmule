/**
 * POST /api/planner/subscriptions/:id/refresh
 *
 * Fuerza refresh de metadata (series: TVDB episodes → seasons/episodes en DB;
 * movie: TMDB detail + release dates → planner_movies).
 *
 * Fase 3: rellena seasons/episodes de la DB a partir de TVDB.
 */
import { getSubscription } from "~/utils/planner-db";
import {
  getTvdbSeriesDetail,
  getTvdbSeriesEpisodes,
} from "~/services/planner/tvdb";
import {
  getTmdbMovieDetail,
  getTmdbMovieReleaseDates,
  getAllTmdbTvEpisodes,
  getTmdbTvDetail,
} from "~/services/planner/tmdb";
import {
  listSeasons,
  listEpisodes,
  upsertSeason,
  upsertEpisode,
  getMovieBySubscription,
  upsertMovie,
  updateSubscription,
  localDateString,
  computeEpisodeStatus,
  computeMovieStatus,
} from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Refresh subscription metadata",
    description:
      "Fetches fresh metadata (TVDB episodes or TMDB movie) and upserts into the planner DB.",
    responses: {
      200: { description: "Metadata refreshed" },
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
  const sub = getSubscription(id);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }

  const now = new Date().toISOString();

  if (sub.type === "series" && (sub.tvdb_id || sub.tmdb_id)) {
    // ── Series: sync seasons + episodes (TVDB o TMDB) ──
    let detail: any = null;
    let episodes: any[] = [];

    if (sub.tvdb_id) {
      detail = await getTvdbSeriesDetail(sub.tvdb_id);
      // El título de episodio se localiza según el idioma de la suscripción
      // (TVDB devuelve el nombre traducido; fallback a inglés si no hay).
      episodes = await getTvdbSeriesEpisodes(sub.tvdb_id, undefined, sub.language ?? undefined);
    } else if (sub.tmdb_id) {
      // Serie añadida desde TMDB (sin tvdb_id): usar TMDB como fuente,
      // con el idioma de la suscripción.
      const tmdbEpisodes = await getAllTmdbTvEpisodes(sub.tmdb_id, sub.language ?? undefined);
      episodes = tmdbEpisodes.map((e) => ({
        seasonNumber: e.season_number,
        number: e.episode_number,
        absoluteNumber: null,
        name: e.name,
        airDate: e.air_date,
        runtime: e.runtime,
        overview: e.overview,
      }));
      const tmdbDetail = await getTmdbTvDetail(sub.tmdb_id);
      detail = tmdbDetail
        ? { name: tmdbDetail.name, status: tmdbDetail.status, overview: tmdbDetail.overview }
        : null;
    }

    // Agrupar por season
    const bySeason = new Map<number, typeof episodes>();
    for (const ep of episodes) {
      if (!bySeason.has(ep.seasonNumber)) bySeason.set(ep.seasonNumber, []);
      bySeason.get(ep.seasonNumber)!.push(ep);
    }

    const existingSeasons = listSeasons(id);
    const existingByNum = new Map(existingSeasons.map((s) => [s.season_number, s]));
    const today = localDateString();

    for (const [seasonNum, eps] of bySeason) {
      const existing = existingByNum.get(seasonNum);
      const season = upsertSeason({
        id: existing?.id ?? 0,
        subscription_id: id,
        season_number: seasonNum,
        monitored: existing?.monitored ?? 1,
        episode_count: eps.length,
        aired_count: eps.filter((e) => e.airDate && e.airDate <= today).length,
      });
      const existingEps = listEpisodes(id, { seasonNumber: seasonNum });
      for (const ep of eps) {
        const existingEp = existingEps.find((e) => e.episode_number === ep.number);
        upsertEpisode({
          id: existingEp?.id ?? 0,
          subscription_id: id,
          season_id: season.id,
          season_number: seasonNum,
          episode_number: ep.number,
          absolute_number: ep.absoluteNumber,
          title: ep.name,
          air_date: ep.airDate,
          runtime: ep.runtime,
          monitored: existingEp?.monitored ?? 1,
          status: computeEpisodeStatus(existingEp?.status, ep.airDate, today),
          file_path: existingEp?.file_path ?? null,
          downloaded_quality: existingEp?.downloaded_quality ?? null,
          grabbed_at: existingEp?.grabbed_at ?? null,
          downloaded_at: existingEp?.downloaded_at ?? null,
          last_search_at: existingEp?.last_search_at ?? null,
          search_attempts: existingEp?.search_attempts ?? 0,
        });
      }
    }

    // Actualizar metadata del sub (status, overview, poster)
    updateSubscription(id, {
      metadata_synced_at: now,
      metadata_json: JSON.stringify({
        tvdbStatus: detail?.status ?? null,
        overview: detail?.overview ?? sub.overview,
      }),
    });
    if (detail?.status === "Ended") {
      updateSubscription(id, { ended_at: now });
    }

    return {
      ok: true,
      seasons: bySeason.size,
      episodes: episodes.length,
      detail: detail
        ? { name: detail.name, status: detail.status, genres: detail.genres }
        : null,
    };
  }

  if (sub.type === "movie" && sub.tmdb_id) {
    // ── Movie: sync detail + release dates (con el idioma de la suscripción) ──
    const movie = await getTmdbMovieDetail(sub.tmdb_id, sub.language ?? undefined);
    if (!movie) {
      setResponseStatus(event, 404);
      return { error: "Movie not found on TMDB" };
    }
    const releaseDates = await getTmdbMovieReleaseDates(sub.tmdb_id).catch(() => ({
      digital: null,
      theatrical: null,
    }));

    const existingMovie = getMovieBySubscription(id);
    const today = localDateString();
    // Fecha de referencia: digital (type 4) si existe; si no, estreno en cines
    // (type 3) o la fecha principal de TMDB. Para películas antiguas (sin
    // estreno digital) esto evita que queden en "No emitido".
    const effectiveDate = releaseDates.digital ?? releaseDates.theatrical ?? movie.release_date;

    upsertMovie({
      id: existingMovie?.id ?? 0,
      subscription_id: id,
      tmdb_id: sub.tmdb_id,
      imdb_id: movie.imdb_id,
      digital_release_date: releaseDates.digital,
      theatrical_release_date: releaseDates.theatrical,
      status: computeMovieStatus(existingMovie?.status, effectiveDate, today),
      file_path: existingMovie?.file_path ?? null,
      downloaded_quality: existingMovie?.downloaded_quality ?? null,
      grabbed_at: existingMovie?.grabbed_at ?? null,
      downloaded_at: existingMovie?.downloaded_at ?? null,
      last_discovery_at: existingMovie?.last_discovery_at ?? null,
      discovery_attempts: existingMovie?.discovery_attempts ?? 0,
    });

    // Localizar el título de la película según el idioma de la suscripción.
    if (movie.title && movie.title !== sub.title) {
      updateSubscription(id, { title: movie.title });
      sub.title = movie.title;
    }

    updateSubscription(id, {
      metadata_synced_at: now,
      metadata_json: JSON.stringify({
        imdbId: movie.imdb_id,
        runtime: movie.runtime,
        genres: movie.genres,
        release_dates: releaseDates,
      }),
    });

    return {
      ok: true,
      movie: { ...movie, release_dates: releaseDates },
    };
  }

  setResponseStatus(event, 400);
  return { error: "Subscription has no tvdb_id (series) or tmdb_id (movie) to refresh" };
});
