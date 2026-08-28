/**
 * Sincronización puntual de metadata de series (episodios).
 *
 * `refreshSeriesEpisodes` re-fetcha los episodios de TVDB/TMDB y los vuelca en
 * planner_seasons/planner_episodes. Se usa ANTES de una descarga (automática o
 * manual) para asegurar que el título del episodio está lo más fresco posible
 * (p.ej. un capítulo emitido hoy cuyo título aún no había llegado al sync
 * periódico). Con `force` se ignora la caché de TVDB/TMDB, acotado por un
 * throttle en memoria para no saturar las APIs.
 */

import { getTvdbSeriesEpisodes } from "./tvdb";
import { getAllTmdbTvEpisodes } from "./tmdb";
import {
  listSeasons,
  listEpisodes,
  upsertSeason,
  upsertEpisode,
  localDateString,
  computeEpisodeStatus,
  type PlannerSubscription,
} from "../../utils/planner-db";

// No forzar el refresco (bypass de caché) más de una vez cada 15 min por serie.
const FORCE_MIN_MS = 15 * 60 * 1000;
const lastForced = new Map<number, number>();

interface FlatEpisode {
  seasonNumber: number;
  number: number;
  absoluteNumber: number | null;
  name: string | null;
  airDate: string | null;
  runtime: number | null;
  overview: string | null;
}

/**
 * Refresca los episodios de una serie en la BD. Devuelve el número de episodios
 * sincronizados (0 si no hay fuente, no hay episodios o el force está throttled).
 * Nunca lanza: los errores de red se tragan para no bloquear una descarga.
 */
export async function refreshSeriesEpisodes(
  sub: PlannerSubscription,
  opts: { force?: boolean } = {},
): Promise<number> {
  const force = opts.force === true;
  if (force) {
    const last = lastForced.get(sub.id) ?? 0;
    if (Date.now() - last < FORCE_MIN_MS) return 0;
  }

  let episodes: FlatEpisode[] = [];
  try {
    if (sub.tvdb_id) {
      const eps = await getTvdbSeriesEpisodes(
        sub.tvdb_id,
        undefined,
        sub.language ?? undefined,
        { noCache: force },
      );
      episodes = eps.map((e) => ({
        seasonNumber: e.seasonNumber,
        number: e.number,
        absoluteNumber: e.absoluteNumber,
        name: e.name,
        airDate: e.airDate,
        runtime: e.runtime,
        overview: e.overview,
      }));
    } else if (sub.tmdb_id) {
      const tmdbEps = await getAllTmdbTvEpisodes(sub.tmdb_id, sub.language ?? undefined, {
        noCache: force,
      });
      episodes = tmdbEps.map((e) => ({
        seasonNumber: e.season_number,
        number: e.episode_number,
        absoluteNumber: null,
        name: e.name,
        airDate: e.air_date,
        runtime: e.runtime,
        overview: e.overview,
      }));
    } else {
      return 0;
    }
  } catch (err: any) {
    console.warn(`[planner] refreshSeriesEpisodes "${sub.title}": ${err?.message ?? err}`);
    return 0;
  }

  if (episodes.length === 0) return 0;
  if (force) lastForced.set(sub.id, Date.now());

  const bySeason = new Map<number, FlatEpisode[]>();
  for (const ep of episodes) {
    if (!bySeason.has(ep.seasonNumber)) bySeason.set(ep.seasonNumber, []);
    bySeason.get(ep.seasonNumber)!.push(ep);
  }

  const existingSeasons = listSeasons(sub.id);
  const existingByNum = new Map(existingSeasons.map((s) => [s.season_number, s]));
  const today = localDateString();

  for (const [seasonNum, eps] of bySeason) {
    const existing = existingByNum.get(seasonNum);
    const season = upsertSeason({
      id: existing?.id ?? 0,
      subscription_id: sub.id,
      season_number: seasonNum,
      monitored: existing?.monitored ?? 1,
      episode_count: eps.length,
      aired_count: eps.filter((e) => e.airDate && e.airDate <= today).length,
    });
    const existingEps = listEpisodes(sub.id, { seasonNumber: seasonNum });
    for (const ep of eps) {
      const existingEp = existingEps.find((e) => e.episode_number === ep.number);
      upsertEpisode({
        id: existingEp?.id ?? 0,
        subscription_id: sub.id,
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

  return episodes.length;
}
