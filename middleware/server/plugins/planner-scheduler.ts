/**
 * Planner scheduler — background jobs del planificador.
 *
 * Jobs (intervalo configurable vía planner.sync_interval_min, default 15 min):
 *   1. updateCalendar() — sincroniza seasons+episodes de series monitorizadas
 *      desde TVDB (solo si metadata_synced_at tiene más de 12h).
 *   2. searchAndGrab() — búsqueda/descarga automática (episodios "waiting"
 *      ya emitidos a las 18:00 y películas disponibles).
 *   3. updateMovies() — sincroniza detalle + release dates (Digital) de movies
 *      monitorizadas desde TMDB (cada 24h).
 *
 * Guard en globalThis para evitar doble registro en HMR.
 */

import {
  getTvdbSeriesEpisodes,
} from "../services/planner/tvdb";
import {
  getTmdbMovieDetail,
  getTmdbMovieReleaseDates,
  getAllTmdbTvEpisodes,
} from "../services/planner/tmdb";
import {
  listSubscriptions,
  listSeasons,
  listEpisodes,
  upsertSeason,
  upsertEpisode,
  getMovieBySubscription,
  upsertMovie,
  updateSubscription,
  getEpisodesReadyForDownload,
  getSubscription,
  enqueueGrab,
  recordSearchHistory,
  updateEpisode,
  localDateString,
  computeEpisodeStatus,
  computeMovieStatus,
  type PlannerSeason,
  type PlannerEpisode,
  type PlannerSubscription,
} from "../utils/planner-db";
import { getConfig, useDatabase } from "../utils/database";
import { searchEpisode, searchMovie, parseSearchServices } from "../services/planner/search-providers";
import { pickBest } from "../services/planner/decision-engine";
import { resolveAltTitles } from "../services/planner/localized-titles";
import type { ParsedRelease } from "../services/planner/release-parser";

const GUARD_KEY = "__transmule_planner_scheduler_started__";
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 min floor

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  const rawInterval = getConfig("planner.sync_interval_min");
  const intervalMin = Math.max(Number(rawInterval) || 15, 5);
  const intervalMs = intervalMin * 60 * 1000;

  // Migración única: episodios legacy en 'wanted' → estado según fecha de aire.
  migrateLegacyWanted();

  setInterval(runJobs, intervalMs);
  // Run once shortly after boot (after DB ready)
  setTimeout(runJobs, 15_000);

  // Cleanup diario: historial de búsquedas > 30 días (configurable)
  setInterval(cleanupHistory, 24 * 60 * 60 * 1000);
  setTimeout(cleanupHistory, 5 * 60 * 1000);

  console.log(`[planner] scheduler started (interval ${intervalMin} min)`);
});

/**
 * Migración única: convierte episodios legacy en estado 'wanted' (ya no se usa)
 * a 'waiting'/'released'/'unreleased' según su fecha de aire.
 */
function migrateLegacyWanted(): void {
  try {
    const db = useDatabase();
    const today = localDateString();
    const rows = db
      .prepare(`SELECT id, air_date FROM planner_episodes WHERE status = 'wanted'`)
      .all() as Array<{ id: number; air_date: string | null }>;
    if (rows.length === 0) return;
    const stmt = db.prepare(`UPDATE planner_episodes SET status = ? WHERE id = ?`);
    for (const row of rows) {
      stmt.run(computeEpisodeStatus(undefined, row.air_date, today), row.id);
    }
    console.log(`[planner] migrated ${rows.length} legacy 'wanted' episodes`);
  } catch (err: any) {
    console.error("[planner] migrateLegacyWanted error:", err?.message);
  }
}

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

    // Localizar el título de la serie según el idioma elegido (p.ej.
    // "Linternas" en vez de "Lanterns"), para que el título mostrado y el
    // buscado usen el idioma seleccionado y no el original.
    const localizedTitle = await resolveAltTitles({
      tvdb_id: sub.tvdb_id,
      tmdb_id: sub.tmdb_id,
      language: sub.language,
      title: sub.title,
      media_type: "series",
    });
    if (localizedTitle[0] && localizedTitle[0] !== sub.title) {
      updateSubscription(sub.id, { title: localizedTitle[0] });
      sub.title = localizedTitle[0];
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
      episodes = await getTvdbSeriesEpisodes(sub.tvdb_id, undefined, sub.language ?? undefined);
    } else {
      const tmdbEps = await getAllTmdbTvEpisodes(sub.tmdb_id!, sub.language ?? undefined);
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

    updateSubscription(sub.id, { metadata_synced_at: new Date().toISOString() });
    console.log(
      `[planner] synced "${sub.title}" — ${bySeason.size} seasons, ${episodes.length} episodes`,
    );
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

    const movie = await getTmdbMovieDetail(sub.tmdb_id, sub.language ?? undefined);
    if (!movie) continue;

    const releaseDates = await getTmdbMovieReleaseDates(sub.tmdb_id).catch(() => ({
      digital: null,
      theatrical: null,
    }));

    const existing = getMovieBySubscription(sub.id);
    const today = localDateString();
    // Fecha de referencia: digital (type 4) si existe; si no, estreno en cines
    // (type 3) o la fecha principal de TMDB.
    const effectiveDate = releaseDates.digital ?? releaseDates.theatrical ?? movie.release_date;
    const status = computeMovieStatus(existing?.status, effectiveDate, today);

    upsertMovie({
      id: existing?.id ?? 0,
      subscription_id: sub.id,
      tmdb_id: sub.tmdb_id,
      imdb_id: movie.imdb_id,
      digital_release_date: releaseDates.digital,
      theatrical_release_date: releaseDates.theatrical,
      status,
      file_path: existing?.file_path ?? null,
      downloaded_quality: existing?.downloaded_quality ?? null,
      grabbed_at: existing?.grabbed_at ?? null,
      downloaded_at: existing?.downloaded_at ?? null,
      last_discovery_at: existing?.last_discovery_at ?? null,
      discovery_attempts: existing?.discovery_attempts ?? 0,
    });

    // Localizar el título según el idioma de la suscripción.
    if (movie.title && movie.title !== sub.title) {
      updateSubscription(sub.id, { title: movie.title });
      sub.title = movie.title;
    }

    updateSubscription(sub.id, { metadata_synced_at: new Date().toISOString() });
    console.log(
      `[planner] movie synced "${sub.title}" — digital=${releaseDates.digital ?? "n/a"} theatrical=${releaseDates.theatrical ?? "n/a"} status=${status}`,
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

  // ── Series: episodios "waiting" que ya han emitido (regla de las 18:00) ──
  const now = new Date();
  const today = localDateString();
  const cutoff = force
    ? today
    : now.getHours() >= 18
      ? today
      : localDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const ready = getEpisodesReadyForDownload(cutoff, force);
  for (const ep of ready) {
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

    searched++;
    await grabEpisode(sub, ep, "auto");
  }

  // ── Movies: waiting (recién estrenadas) + released (si force) ─────────────
  const db = useDatabase();
  const movieStatus = force ? "('waiting', 'released')" : "('waiting')";
  const movieRows = db
    .prepare(
      `SELECT m.*, s.title, s.year, s.min_quality, s.max_size_mb, s.search_services_json, s.language,
              s.id AS sub_id, s.added_at AS sub_added_at
       FROM planner_movies m
       JOIN planner_subscriptions s ON s.id = m.subscription_id
       WHERE m.status IN ${movieStatus}
         AND s.monitored = 1
         AND COALESCE(m.digital_release_date, m.theatrical_release_date) IS NOT NULL
         AND COALESCE(m.digital_release_date, m.theatrical_release_date) <= ?
       ORDER BY COALESCE(m.digital_release_date, m.theatrical_release_date) ASC`,
    )
    .all(today) as unknown as Array<Record<string, any>>;

  for (const movie of movieRows) {
    if (searched >= maxSearches) break;
    if (!force && movie.last_discovery_at) {
      const last = new Date(movie.last_discovery_at).getTime();
      if (!Number.isNaN(last) && Date.now() - last < 60 * 60 * 1000) continue;
    }

    // Backlog: pausa la auto-descarga de películas ya estrenadas antes del alta.
    if (!force && isBacklog(movie.digital_release_date ?? movie.theatrical_release_date, movie.sub_added_at)) continue;

    const services = parseSearchServices(movie.search_services_json);
    searched++;

    try {
      const altTitles = await resolveAltTitles({
        tmdb_id: movie.tmdb_id ?? null,
        language: movie.language,
        title: movie.title,
        media_type: "movie",
      });
      const items = await searchMovie(movie.title, movie.year ?? null, services, movie.language ?? undefined, undefined, altTitles);
      const parsed = items.map((i) => ({ ...i.parsed, sizeMb: i.sizeMb }));
      const decision = pickBest({
        releases: parsed,
        expectedTitle: movie.title,
        ...(altTitles.length ? { altTitles } : {}),
        ...(movie.year ? { expectedYear: movie.year } : {}),
        minQuality: (movie.min_quality ?? "fullhd") as any,
        ...(movie.max_size_mb != null ? { maxSizeMb: movie.max_size_mb } : {}),
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
        // Sin release que cumpla la calidad → en espera (se reintenta con backoff).
        db.prepare("UPDATE planner_movies SET status = 'waiting', last_discovery_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          movie.id,
        );
      }
    } catch (err: any) {
      console.error(`[planner] movie search failed for "${movie.title}":`, err?.message);
    }
  }
}

// ─── Search & grab de un único episodio (compartido) ────────────────────────

/**
 * Busca y descarga un único episodio (decision engine + enqueueGrab).
 * `searchKind` distingue "auto" (scheduler) de "manual" (botón de temporada).
 */
async function grabEpisode(
  sub: PlannerSubscription,
  ep: PlannerEpisode,
  searchKind: string,
): Promise<void> {
  const services = parseSearchServices(sub.search_services_json);
  try {
    // Títulos localizados (idioma elegido) para el scoring.
    const altTitles = await resolveAltTitles({
      tvdb_id: sub.tvdb_id,
      tmdb_id: sub.tmdb_id,
      language: sub.language,
      title: sub.title,
      media_type: "series",
    });
    const items = await searchEpisode(sub.title, ep.season_number, ep.episode_number, services, sub.language ?? undefined, undefined, altTitles);
    const parsed = items.map((i) => ({ ...i.parsed, sizeMb: i.sizeMb }));
    const decision = pickBest({
      releases: parsed,
      expectedTitle: sub.title,
      ...(altTitles.length ? { altTitles } : {}),
      ...(ep.title ? { expectedEpisodeTitle: ep.title } : {}),
      season: ep.season_number,
      episode: ep.episode_number,
      minQuality: (sub.min_quality ?? "fullhd") as any,
      ...(sub.max_size_mb != null ? { maxSizeMb: sub.max_size_mb } : {}),
      ...(sub.language
        ? { languageProfile: { mustHave: [sub.language], allowUnknownLang: true } }
        : {}),
    });

    recordSearchHistory({
      subscription_id: sub.id,
      episode_id: ep.id,
      movie_id: null,
      service: "planner-scheduler",
      search_kind: searchKind,
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

/**
 * Busca y descarga los episodios ya emitidos (air_date <= hoy) de una lista.
 * Devuelve el número de episodios encolados para búsqueda.
 */
async function grabAiredEpisodes(
  subscriptionId: number,
  episodes: PlannerEpisode[],
): Promise<number> {
  const sub = getSubscription(subscriptionId);
  if (!sub) return 0;
  const today = localDateString();
  let queued = 0;
  for (const ep of episodes) {
    // Solo emitidos y sin archivo ni grab previo.
    if (!ep.air_date || ep.air_date > today) continue;
    if (ep.file_path || ep.status === "downloaded" || ep.status === "grabbed") continue;
    queued++;
    await grabEpisode(sub, ep, "manual");
  }
  return queued;
}

/**
 * "Descargar temporada": busca y descarga los episodios emitidos de una temporada.
 * Lo llama el endpoint de descarga de temporada (acción manual del usuario).
 */
export async function searchAndGrabSeason(
  subscriptionId: number,
  seasonNumber: number,
): Promise<{ queued: number }> {
  return {
    queued: await grabAiredEpisodes(subscriptionId, listEpisodes(subscriptionId, { seasonNumber })),
  };
}

/**
 * "Buscar ahora" (serie): busca y descarga todos los episodios emitidos de la serie.
 * Lo llama el endpoint de búsqueda manual de la suscripción.
 */
export async function searchAndGrabSubscription(
  subscriptionId: number,
): Promise<{ queued: number }> {
  return { queued: await grabAiredEpisodes(subscriptionId, listEpisodes(subscriptionId)) };
}

/**
 * "Buscar ahora" (película): busca el mejor release de una película ya estrenada
 * y lo encola (auto-pick). Si no encuentra nada que cumpla la calidad, la deja
 * en 'waiting' (en espera de un release con la calidad pedida).
 */
export async function searchAndGrabMovie(subscriptionId: number): Promise<{ queued: number }> {
  const sub = getSubscription(subscriptionId);
  if (!sub) return { queued: 0 };
  const movie = getMovieBySubscription(subscriptionId);
  if (!movie) return { queued: 0 };
  const db = useDatabase();
  const services = parseSearchServices(sub.search_services_json);
  const today = localDateString();
  const releaseDate = movie.digital_release_date ?? movie.theatrical_release_date;

  // Solo películas ya estrenadas; si no hay fecha o es futura, no hay nada que buscar.
  if (!releaseDate || releaseDate > today) return { queued: 0 };

  try {
    const altTitles = await resolveAltTitles({
      tmdb_id: sub.tmdb_id ?? null,
      language: sub.language,
      title: sub.title,
      media_type: "movie",
    });
    const items = await searchMovie(sub.title, sub.year ?? null, services, sub.language ?? undefined, undefined, altTitles);
    const parsed = items.map((i) => ({ ...i.parsed, sizeMb: i.sizeMb }));
    const decision = pickBest({
      releases: parsed,
      expectedTitle: sub.title,
      ...(altTitles.length ? { altTitles } : {}),
      ...(sub.year ? { expectedYear: sub.year } : {}),
      minQuality: (sub.min_quality ?? "fullhd") as any,
      ...(sub.max_size_mb != null ? { maxSizeMb: sub.max_size_mb } : {}),
      ...(sub.language
        ? { languageProfile: { mustHave: [sub.language], allowUnknownLang: true } }
        : {}),
    });

    recordSearchHistory({
      subscription_id: subscriptionId,
      episode_id: null,
      movie_id: movie.id,
      service: "planner",
      search_kind: "manual",
      query: sub.title,
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
          subscription_id: subscriptionId,
          episode_id: null,
          movie_id: movie.id,
          release_title: winner.rawName,
          release_url: winner.url,
          release_hash: winner.hash ?? null,
          release_quality: winner.parsed.quality,
          release_size_mb: winner.sizeMb ?? null,
          release_seeds: winner.seeds ?? null,
          service: winner.service,
          priority: "manual",
        });
        db.prepare(
          "UPDATE planner_movies SET status = 'grabbed', grabbed_at = ?, last_discovery_at = ? WHERE id = ?",
        ).run(new Date().toISOString(), new Date().toISOString(), movie.id);
        console.log(`[planner] grabbed movie "${sub.title}" ← ${winner.rawName} (${winner.service})`);
        return { queued: 1 };
      }
    } else {
      db.prepare(
        "UPDATE planner_movies SET status = 'waiting', last_discovery_at = ? WHERE id = ?",
      ).run(new Date().toISOString(), movie.id);
    }
  } catch (err: any) {
    console.error(`[planner] movie search failed for "${sub.title}":`, err?.message);
  }
  return { queued: 0 };
}

// ─── Utility exports (used by API endpoints) ────────────────────────────────

export { runJobs, searchAndGrab };
