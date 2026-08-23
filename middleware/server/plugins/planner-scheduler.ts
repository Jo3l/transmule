/**
 * Planner scheduler — background jobs del planificador.
 *
 * Jobs (intervalo configurable vía planner.sync_interval_min, default 15 min):
 *   1. updateCalendar() — sincroniza seasons+episodes de series monitorizadas
 *      desde TVDB (solo si metadata_synced_at tiene más de 12h).
 *   2. checkWanted() — marca episodios como 'wanted' cuando ya han emitido
 *      (air_date <= NOW) y están monitored.
 *   3. updateMovies() — sincroniza detalle + release dates (Digital) de movies
 *      monitorizadas desde TMDB (cada 24h).
 *
 * Guard en globalThis para evitar doble registro en HMR.
 */

import { getTvdbSeriesEpisodes } from "../services/planner/tvdb";
import {
  getTmdbMovieDetail,
  getTmdbMovieReleaseDates,
  getAllTmdbTvEpisodes,
} from "../services/planner/tmdb";
import {
  listSubscriptions,
  listSeasons,
  upsertSeason,
  upsertEpisode,
  getMovieBySubscription,
  upsertMovie,
  updateSubscription,
  getWantedEpisodes,
  getSubscription,
  enqueueGrab,
  recordSearchHistory,
  updateEpisode,
  type PlannerSeason,
} from "../utils/planner-db";
import { getConfig, useDatabase } from "../utils/database";
import { searchEpisode, searchMovie, parseSearchServices } from "../services/planner/search-providers";
import { pickBest } from "../services/planner/decision-engine";
import type { ParsedRelease } from "../services/planner/release-parser";

const GUARD_KEY = "__transmule_planner_scheduler_started__";
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 min floor

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  const rawInterval = getConfig("planner.sync_interval_min");
  const intervalMin = Math.max(Number(rawInterval) || 15, 5);
  const intervalMs = intervalMin * 60 * 1000;

  setInterval(runJobs, intervalMs);
  // Run once shortly after boot (after DB ready)
  setTimeout(runJobs, 15_000);

  // Cleanup diario: historial de búsquedas > 30 días (configurable)
  setInterval(cleanupHistory, 24 * 60 * 60 * 1000);
  setTimeout(cleanupHistory, 5 * 60 * 1000);

  console.log(`[planner] scheduler started (interval ${intervalMin} min)`);
});

/** Borra planner_search_history más antiguo que planner.history_retention_days (default 30). */
async function cleanupHistory(): Promise<void> {
  const db = useDatabase();
  const retentionDays = Math.max(
    Number(getConfig("planner.history_retention_days")) || 30,
    1,
  );
  const result = db
    .prepare(
      `DELETE FROM planner_search_history
       WHERE picked_at IS NOT NULL
         AND picked_at < datetime('now', '-' || ? || ' days')`,
    )
    .run(retentionDays);
  if (result.changes > 0) {
    console.log(`[planner] cleanup: removed ${result.changes} old search history rows`);
  }
}

async function runJobs(): Promise<void> {
  try {
    await updateCalendar();
  } catch (err: any) {
    console.error("[planner] updateCalendar error:", err?.message);
  }
  try {
    await checkWanted();
  } catch (err: any) {
    console.error("[planner] checkWanted error:", err?.message);
  }
  try {
    await searchAndGrab();
  } catch (err: any) {
    console.error("[planner] searchAndGrab error:", err?.message);
  }
  try {
    await updateMovies();
  } catch (err: any) {
    console.error("[planner] updateMovies error:", err?.message);
  }
}

// ─── Job 1: sync series calendar from TVDB ──────────────────────────────────

async function updateCalendar(): Promise<void> {
  const series = listSubscriptions({ type: "series" });
  const staleThreshold = Date.now() - 12 * 60 * 60 * 1000;

  for (const sub of series) {
    if (!sub.tvdb_id && !sub.tmdb_id) continue;
    // Skip if synced < 12h ago
    if (sub.metadata_synced_at) {
      const synced = new Date(sub.metadata_synced_at).getTime();
      if (!Number.isNaN(synced) && synced > staleThreshold) continue;
    }

    // TVDB primero; si la serie no tiene tvdb_id (añadida desde TMDB),
    // usa TMDB como fuente de episodios.
    let episodes: Array<{
      seasonNumber: number;
      number: number;
      absoluteNumber: number | null;
      name: string | null;
      airDate: string | null;
      runtime: number | null;
      overview: string | null;
    }>;
    if (sub.tvdb_id) {
      episodes = await getTvdbSeriesEpisodes(sub.tvdb_id);
    } else {
      const tmdbEps = await getAllTmdbTvEpisodes(sub.tmdb_id!);
      episodes = tmdbEps.map((e) => ({
        seasonNumber: e.season_number,
        number: e.episode_number,
        absoluteNumber: null,
        name: e.name,
        airDate: e.air_date,
        runtime: e.runtime,
        overview: e.overview,
      }));
    }
    if (episodes.length === 0) continue;

    const bySeason = new Map<number, typeof episodes>();
    for (const ep of episodes) {
      if (!bySeason.has(ep.seasonNumber)) bySeason.set(ep.seasonNumber, []);
      bySeason.get(ep.seasonNumber)!.push(ep);
    }

    const existingSeasons = listSeasons(sub.id);
    const existingByNum = new Map(
      existingSeasons.map((s) => [s.season_number, s]),
    );

    const today = new Date().toISOString().slice(0, 10);
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
      for (const ep of eps) {
        const existingEp = (await import("../utils/planner-db"))
          .listEpisodes(sub.id, { seasonNumber: seasonNum })
          .find((e) => e.episode_number === ep.number);
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
          status: existingEp?.status ?? "unreleased",
          file_path: existingEp?.file_path ?? null,
          downloaded_quality: existingEp?.downloaded_quality ?? null,
          grabbed_at: existingEp?.grabbed_at ?? null,
          downloaded_at: existingEp?.downloaded_at ?? null,
          last_search_at: existingEp?.last_search_at ?? null,
          search_attempts: existingEp?.search_attempts ?? 0,
        });
      }
    }

    updateSubscription(sub.id, { metadata_synced_at: new Date().toISOString() });
    console.log(
      `[planner] synced "${sub.title}" — ${bySeason.size} seasons, ${episodes.length} episodes`,
    );
  }
}

// ─── Job 2: mark aired episodes as wanted ───────────────────────────────────

async function checkWanted(): Promise<void> {
  const db = useDatabase();
  const today = new Date().toISOString().slice(0, 10);

  const result = db
    .prepare(
      `UPDATE planner_episodes
       SET status = 'wanted', last_search_at = COALESCE(last_search_at, ?)
       WHERE monitored = 1
         AND status IN ('unreleased', 'released')
         AND air_date IS NOT NULL
         AND air_date <= ?
         AND file_path IS NULL
         AND EXISTS (
           SELECT 1 FROM planner_subscriptions s
           WHERE s.id = planner_episodes.subscription_id AND s.monitored = 1
         )`,
    )
    .run(today, today);

  if (result.changes > 0) {
    console.log(`[planner] checkWanted: ${result.changes} episodes now wanted`);
  }
}

// ─── Job 3: sync movie details + digital release dates from TMDB ────────────

async function updateMovies(): Promise<void> {
  const movies = listSubscriptions({ type: "movie" });
  const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;

  for (const sub of movies) {
    if (!sub.tmdb_id) continue;
    if (sub.metadata_synced_at) {
      const synced = new Date(sub.metadata_synced_at).getTime();
      if (!Number.isNaN(synced) && synced > staleThreshold) continue;
    }

    const movie = await getTmdbMovieDetail(sub.tmdb_id);
    if (!movie) continue;

    const releaseDates = await getTmdbMovieReleaseDates(sub.tmdb_id).catch(() => ({
      digital: null,
      theatrical: null,
    }));

    const existing = getMovieBySubscription(sub.id);
    const today = new Date().toISOString().slice(0, 10);
    let status = existing?.status ?? "unreleased";
    if (status === "unreleased") {
      if (releaseDates.digital && releaseDates.digital <= today) {
        status = "available";
      } else if (releaseDates.theatrical && releaseDates.theatrical <= today) {
        status = "released";
      }
    }

    upsertMovie({
      id: existing?.id ?? 0,
      subscription_id: sub.id,
      tmdb_id: sub.tmdb_id,
      imdb_id: movie.imdb_id,
      digital_release_date: releaseDates.digital,
      status: status as any,
      file_path: existing?.file_path ?? null,
      downloaded_quality: existing?.downloaded_quality ?? null,
      grabbed_at: existing?.grabbed_at ?? null,
      downloaded_at: existing?.downloaded_at ?? null,
      last_discovery_at: existing?.last_discovery_at ?? null,
      discovery_attempts: existing?.discovery_attempts ?? 0,
    });

    updateSubscription(sub.id, { metadata_synced_at: new Date().toISOString() });
    console.log(
      `[planner] movie synced "${sub.title}" — digital=${releaseDates.digital ?? "n/a"} status=${status}`,
    );
  }
}

// ─── Job 4: search & grab wanted episodes/movies ────────────────────────────

/**
 * True si el item es "backlog": emitido/disponible ANTES del alta de la
 * suscripción. El scheduler pausa estos por defecto (solo auto-descarga
 * lo que tiene evento de descarga futuro). `force` lo ignora.
 */
function isBacklog(airDate: string | null, addedAt: string): boolean {
  if (!airDate) return false;
  const added = (addedAt ?? "").slice(0, 10);
  return added !== "" && airDate < added;
}

/**
 * Para cada episodio wanted (y movies available/wanted):
 *   1. Busca en los search providers habilitados de la subscription
 *   2. Parse + decide con el decision engine
 *   3. Encola el winner en planner_grab_queue
 *
 * Rate-limit: máx N búsquedas por ciclo (configurable planner.max_searches_per_cycle).
 */
async function searchAndGrab(opts: { force?: boolean } = {}): Promise<void> {
  const force = opts.force === true;
  const maxSearches = Math.max(Number(getConfig("planner.max_searches_per_cycle")) || 10, 1);
  let searched = 0;

  // ── Series: episodios wanted ────────────────────────────────────────────
  const wanted = getWantedEpisodes();
  for (const ep of wanted) {
    if (searched >= maxSearches) break;
    const sub = getSubscription(ep.subscription_id);
    if (!sub || !sub.monitored) continue;

    // Backoff: skip si se buscó hace < 30 min (salvo force)
    if (!force && ep.last_search_at) {
      const last = new Date(ep.last_search_at).getTime();
      if (!Number.isNaN(last) && Date.now() - last < 30 * 60 * 1000) continue;
    }

    // Backlog: pausa la auto-descarga de episodios ya emitidos antes del alta
    // de la suscripción (solo auto-descarga lo que tiene evento futuro). Force lo ignora.
    if (!force && isBacklog(ep.air_date, sub.added_at)) continue;

    const services = parseSearchServices(sub.search_services_json);

    searched++;
    try {
      const items = await searchEpisode(sub.title, ep.season_number, ep.episode_number, services, sub.language ?? undefined);
      const parsed = items.map((i) => i.parsed);
      const decision = pickBest({
        releases: parsed,
        expectedTitle: sub.title,
        season: ep.season_number,
        episode: ep.episode_number,
        minQuality: (sub.min_quality ?? "fullhd") as any,
        ...(sub.language
          ? { languageProfile: { mustHave: [sub.language], allowUnknownLang: true } }
          : {}),
      });

      recordSearchHistory({
        subscription_id: sub.id,
        episode_id: ep.id,
        movie_id: null,
        service: "planner-scheduler",
        search_kind: "auto",
        query: `${sub.title} S${String(ep.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`,
        results_count: items.length,
        picked_release: decision.picked ? decision.picked.release.raw : null,
        picked_title: decision.picked ? decision.picked.release.title : null,
        picked_quality: decision.picked ? decision.picked.release.quality : null,
        picked_size_mb: null,
        picked_hash: null,
        picked_seeds: null,
        picked_at: new Date().toISOString(),
        status: decision.picked ? "grabbed" : "no_results",
        error_message: decision.picked ? null : decision.note,
      });

      if (decision.picked) {
        const winner = items.find((i) => i.parsed.raw === decision.picked!.release.raw);
        if (winner) {
          enqueueGrab({
            subscription_id: sub.id,
            episode_id: ep.id,
            movie_id: null,
            release_title: winner.rawName,
            release_url: winner.url,
            release_hash: winner.hash ?? null,
            release_quality: winner.parsed.quality,
            release_size_mb: winner.sizeMb ?? null,
            release_seeds: winner.seeds ?? null,
            service: winner.service,
            priority: "normal",
          });
          updateEpisode(ep.id, {
            status: "grabbed",
            grabbed_at: new Date().toISOString(),
            last_search_at: new Date().toISOString(),
          });
          console.log(`[planner] grabbed "${sub.title}" S${ep.season_number}E${ep.episode_number} ← ${winner.rawName} (${winner.service})`);
        }
      } else {
        updateEpisode(ep.id, { last_search_at: new Date().toISOString() });
      }
    } catch (err: any) {
      console.error(`[planner] search failed for "${sub.title}" S${ep.season_number}E${ep.episode_number}:`, err?.message);
    }
  }

  // ── Movies: available/wanted ─────────────────────────────────────────────
  const db = useDatabase();
  const movieRows = db
    .prepare(
      `SELECT m.*, s.title, s.min_quality, s.search_services_json, s.language, s.id AS sub_id,
              s.added_at AS sub_added_at
       FROM planner_movies m
       JOIN planner_subscriptions s ON s.id = m.subscription_id
       WHERE m.status IN ('available', 'wanted', 'released')
         AND s.monitored = 1
       ORDER BY m.digital_release_date ASC`,
    )
    .all() as unknown as Array<Record<string, any>>;

  for (const movie of movieRows) {
    if (searched >= maxSearches) break;
    if (!force && movie.last_discovery_at) {
      const last = new Date(movie.last_discovery_at).getTime();
      if (!Number.isNaN(last) && Date.now() - last < 60 * 60 * 1000) continue;
    }

    // Backlog: pausa la auto-descarga de películas ya disponibles antes del alta.
    if (!force && isBacklog(movie.digital_release_date, movie.sub_added_at)) continue;

    const services = parseSearchServices(movie.search_services_json);
    searched++;

    try {
      const items = await searchMovie(movie.title, movie.year, services, movie.language ?? undefined);
      const parsed = items.map((i) => i.parsed);
      const decision = pickBest({
        releases: parsed,
        expectedTitle: movie.title,
        minQuality: (movie.min_quality ?? "fullhd") as any,
        ...(movie.language
          ? { languageProfile: { mustHave: [movie.language], allowUnknownLang: true } }
          : {}),
      });

      recordSearchHistory({
        subscription_id: movie.sub_id,
        episode_id: null,
        movie_id: movie.id,
        service: "planner-scheduler",
        search_kind: "auto",
        query: movie.title,
        results_count: items.length,
        picked_release: decision.picked ? decision.picked.release.raw : null,
        picked_title: decision.picked ? decision.picked.release.title : null,
        picked_quality: decision.picked ? decision.picked.release.quality : null,
        picked_size_mb: null,
        picked_hash: null,
        picked_seeds: null,
        picked_at: new Date().toISOString(),
        status: decision.picked ? "grabbed" : "no_results",
        error_message: decision.picked ? null : decision.note,
      });

      if (decision.picked) {
        const winner = items.find((i) => i.parsed.raw === decision.picked!.release.raw);
        if (winner) {
          enqueueGrab({
            subscription_id: movie.sub_id,
            episode_id: null,
            movie_id: movie.id,
            release_title: winner.rawName,
            release_url: winner.url,
            release_hash: winner.hash ?? null,
            release_quality: winner.parsed.quality,
            release_size_mb: winner.sizeMb ?? null,
            release_seeds: winner.seeds ?? null,
            service: winner.service,
            priority: "normal",
          });
          db.prepare(
            "UPDATE planner_movies SET status = 'grabbed', grabbed_at = ?, last_discovery_at = ? WHERE id = ?",
          ).run(new Date().toISOString(), new Date().toISOString(), movie.id);
          console.log(`[planner] grabbed movie "${movie.title}" ← ${winner.rawName} (${winner.service})`);
        }
      } else {
        db.prepare("UPDATE planner_movies SET last_discovery_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          movie.id,
        );
      }
    } catch (err: any) {
      console.error(`[planner] movie search failed for "${movie.title}":`, err?.message);
    }
  }
}

// ─── Utility exports (used by API endpoints) ────────────────────────────────

export { runJobs, searchAndGrab };
