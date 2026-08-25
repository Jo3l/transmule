/**
 * Planner DB helpers — CRUD tipado para tablas del planificador.
 *
 * Tablas cubiertas (ver /home/jo3l/www/transmule/.hermes/plans/planner.md):
 *   - planner_subscriptions
 *   - planner_seasons
 *   - planner_episodes
 *   - planner_movies
 *   - planner_quality_profiles
 *   - planner_language_profiles
 *   - planner_indexers
 *   - planner_search_history
 *   - planner_grab_queue
 *   - planner_metadata_cache
 *
 * El resto del codebase (scheduler, importer, decision engine) usa estos
 * helpers. Las funciones son síncronas porque `node:sqlite` (DatabaseSync)
 * no requiere await para operaciones individuales.
 */

import { useDatabase } from "./database";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PlannerSubscriptionType = "series" | "movie";
export type PlannerSubscriptionStatus = "continuing" | "ended" | "released";
export type PlannerMinQuality = "uhd" | "fullhd" | "hd" | "sd";
export type PlannerEpisodeStatus =
  | "unreleased"
  | "released"
  | "waiting"
  | "grabbed"
  | "downloaded"
  | "cutoff_unmet"
  | "failed";
export type PlannerMovieStatus =
  | "unreleased"
  | "waiting"
  | "released"
  | "grabbed"
  | "downloaded"
  | "cutoff_unmet"
  | "failed";
export type PlannerIndexerKind = "newznab" | "torznab" | "rss";
export type PlannerGrabPriority = "normal" | "high" | "manual";
export type PlannerGrabState =
  | "pending"
  | "dispatched"
  | "failed"
  | "completed";

export interface PlannerSubscription {
  id: number;
  type: PlannerSubscriptionType;
  tmdb_id: number | null;
  tvdb_id: number | null;
  imdb_id: string | null;
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string | null;
  genres_json: string | null;
  status: PlannerSubscriptionStatus;
  monitored: number;
  min_quality: PlannerMinQuality;
  max_size_mb: number | null;
  root_folder: string;
  search_services_json: string | null;
  language: string | null;
  parent_subscription_id: number | null;
  season_filter: number | null;
  added_at: string;
  ended_at: string | null;
  metadata_synced_at: string | null;
  metadata_json: string | null;
}

export interface PlannerSeason {
  id: number;
  subscription_id: number;
  season_number: number;
  monitored: number;
  episode_count: number | null;
  aired_count: number | null;
}

export interface PlannerEpisode {
  id: number;
  subscription_id: number;
  season_id: number;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  title: string | null;
  air_date: string | null;
  runtime: number | null;
  monitored: number;
  status: PlannerEpisodeStatus;
  file_path: string | null;
  downloaded_quality: string | null;
  grabbed_at: string | null;
  downloaded_at: string | null;
  last_search_at: string | null;
  search_attempts: number;
}

export interface PlannerMovie {
  id: number;
  subscription_id: number;
  tmdb_id: number | null;
  imdb_id: string | null;
  digital_release_date: string | null;
  theatrical_release_date: string | null;
  status: PlannerMovieStatus;
  file_path: string | null;
  downloaded_quality: string | null;
  grabbed_at: string | null;
  downloaded_at: string | null;
  last_discovery_at: string | null;
  discovery_attempts: number;
}

export interface PlannerQualityProfile {
  id: number;
  name: string;
  is_default: number;
  qualities_json: string;
  cutoff: string;
  upgrade_until: string | null;
  min_size_mb: number | null;
  max_size_mb: number | null;
  created_at: string;
}

export interface PlannerLanguageProfile {
  id: number;
  name: string;
  is_default: number;
  must_have_json: string | null;
  must_not_have_json: string | null;
  created_at: string;
}

export interface PlannerIndexer {
  id: number;
  name: string;
  kind: PlannerIndexerKind;
  base_url: string;
  api_key: string | null;
  enabled: number;
  priority: number;
  last_sync_at: string | null;
  last_sync_status: string | null;
  added_at: string;
}

export interface PlannerSearchHistory {
  id: number;
  subscription_id: number;
  episode_id: number | null;
  movie_id: number | null;
  service: string;
  search_kind: string;
  query: string | null;
  results_count: number | null;
  picked_release: string | null;
  picked_title: string | null;
  picked_quality: string | null;
  picked_size_mb: number | null;
  picked_hash: string | null;
  picked_seeds: number | null;
  picked_at: string;
  status: string;
  error_message: string | null;
}

export interface PlannerGrabQueueEntry {
  id: number;
  subscription_id: number;
  episode_id: number | null;
  movie_id: number | null;
  release_title: string | null;
  release_url: string;
  release_hash: string | null;
  release_quality: string | null;
  release_size_mb: number | null;
  release_seeds: number | null;
  service: string;
  state: PlannerGrabState;
  attempts: number;
  last_error: string | null;
  priority: PlannerGrabPriority;
  created_at: string;
}

export interface PlannerMetadataCacheEntry {
  id: number;
  source: string;
  external_id: string;
  endpoint: string;
  payload_json: string;
  fetched_at: string;
  expires_at: string;
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

export function listSubscriptions(opts: {
  type?: PlannerSubscriptionType;
  monitored?: boolean;
} = {}): PlannerSubscription[] {
  const db = useDatabase();
  let sql =
    "SELECT * FROM planner_subscriptions WHERE 1=1";
  const params: unknown[] = [];
  if (opts.type) {
    sql += " AND type = ?";
    params.push(opts.type);
  }
  if (opts.monitored !== undefined) {
    sql += " AND monitored = ?";
    params.push(opts.monitored ? 1 : 0);
  }
  sql += " ORDER BY added_at DESC";
  return db.prepare(sql).all(...(params as any)) as unknown as PlannerSubscription[];
}

export function getSubscription(id: number): PlannerSubscription | undefined {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_subscriptions WHERE id = ?")
    .get(id) as unknown as PlannerSubscription | undefined;
}

export interface CreateSubscriptionInput {
  type: PlannerSubscriptionType;
  title: string;
  status: PlannerSubscriptionStatus;
  root_folder: string;
  min_quality?: PlannerMinQuality;
  max_size_mb?: number | null;
  monitored?: boolean;
  tmdb_id?: number | null;
  tvdb_id?: number | null;
  imdb_id?: string | null;
  year?: number | null;
  poster_url?: string | null;
  overview?: string | null;
  genres_json?: string | null;
  search_services_json?: string | null;
  language?: string | null;
  parent_subscription_id?: number | null;
  season_filter?: number | null;
}

export function createSubscription(input: CreateSubscriptionInput): PlannerSubscription {
  const db = useDatabase();
  const result = db
    .prepare(
      `INSERT INTO planner_subscriptions
        (type, tmdb_id, tvdb_id, imdb_id, title, year, poster_url, overview, genres_json,
         status, monitored, min_quality, max_size_mb, root_folder, search_services_json, language,
         parent_subscription_id, season_filter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.type,
      input.tmdb_id ?? null,
      input.tvdb_id ?? null,
      input.imdb_id ?? null,
      input.title,
      input.year ?? null,
      input.poster_url ?? null,
      input.overview ?? null,
      input.genres_json ?? null,
      input.status,
      input.monitored === false ? 0 : 1,
      input.min_quality ?? "fullhd",
      input.max_size_mb ?? null,
      input.root_folder,
      input.search_services_json ?? null,
      input.language ?? null,
      input.parent_subscription_id ?? null,
      input.season_filter ?? null,
    );
  return getSubscription(Number(result.lastInsertRowid))!;
}

export interface UpdateSubscriptionInput {
  title?: string | null;
  monitored?: boolean;
  min_quality?: PlannerMinQuality;
  max_size_mb?: number | null;
  root_folder?: string;
  search_services_json?: string | null;
  language?: string | null;
  ended_at?: string | null;
  metadata_synced_at?: string | null;
  metadata_json?: string | null;
}

export function updateSubscription(
  id: number,
  input: UpdateSubscriptionInput,
): PlannerSubscription | undefined {
  const db = useDatabase();
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    if (typeof value === "boolean") params.push(value ? 1 : 0);
    else params.push(value);
  }
  if (fields.length === 0) return getSubscription(id);
  params.push(id);
  db.prepare(`UPDATE planner_subscriptions SET ${fields.join(", ")} WHERE id = ?`).run(
    ...(params as unknown as Parameters<ReturnType<typeof db.prepare>["run"]>),
  );
  return getSubscription(id);
}

export function deleteSubscription(id: number): boolean {
  const db = useDatabase();
  const result = db
    .prepare("DELETE FROM planner_subscriptions WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ─── Seasons ────────────────────────────────────────────────────────────────

export function listSeasons(subscriptionId: number): PlannerSeason[] {
  const db = useDatabase();
  return db
    .prepare(
      "SELECT * FROM planner_seasons WHERE subscription_id = ? ORDER BY season_number ASC",
    )
    .all(subscriptionId) as unknown as PlannerSeason[];
}

export function upsertSeason(input: PlannerSeason): PlannerSeason {
  const db = useDatabase();
  db.prepare(
    `INSERT INTO planner_seasons
      (subscription_id, season_number, monitored, episode_count, aired_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(subscription_id, season_number) DO UPDATE SET
       monitored = excluded.monitored,
       episode_count = excluded.episode_count,
       aired_count = excluded.aired_count`,
  ).run(
    input.subscription_id,
    input.season_number,
    input.monitored,
    input.episode_count,
    input.aired_count,
  );
  const row = db
    .prepare(
      "SELECT id FROM planner_seasons WHERE subscription_id = ? AND season_number = ?",
    )
    .get(input.subscription_id, input.season_number) as { id: number };
  return { ...input, id: row.id };
}

// ─── Episodes ───────────────────────────────────────────────────────────────

export function listEpisodes(
  subscriptionId: number,
  opts: { seasonNumber?: number; status?: PlannerEpisodeStatus } = {},
): PlannerEpisode[] {
  const db = useDatabase();
  let sql = "SELECT * FROM planner_episodes WHERE subscription_id = ?";
  const params: unknown[] = [subscriptionId];
  if (opts.seasonNumber !== undefined) {
    sql += " AND season_number = ?";
    params.push(opts.seasonNumber);
  }
  if (opts.status) {
    sql += " AND status = ?";
    params.push(opts.status);
  }
  sql += " ORDER BY season_number ASC, episode_number ASC";
  return db.prepare(sql).all(...(params as any)) as unknown as PlannerEpisode[];
}

export function upsertEpisode(input: PlannerEpisode): PlannerEpisode {
  const db = useDatabase();
  db.prepare(
    `INSERT INTO planner_episodes
      (subscription_id, season_id, season_number, episode_number, absolute_number,
       title, air_date, runtime, monitored, status, file_path,
       downloaded_quality, grabbed_at, downloaded_at, last_search_at, search_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(subscription_id, season_number, episode_number) DO UPDATE SET
       title = excluded.title,
       air_date = excluded.air_date,
       runtime = excluded.runtime,
       monitored = excluded.monitored,
       status = excluded.status,
       file_path = excluded.file_path,
       downloaded_quality = excluded.downloaded_quality,
       grabbed_at = excluded.grabbed_at,
       downloaded_at = excluded.downloaded_at,
       last_search_at = excluded.last_search_at,
       search_attempts = excluded.search_attempts`,
  ).run(
    input.subscription_id,
    input.season_id,
    input.season_number,
    input.episode_number,
    input.absolute_number,
    input.title,
    input.air_date,
    input.runtime,
    input.monitored,
    input.status,
    input.file_path,
    input.downloaded_quality,
    input.grabbed_at,
    input.downloaded_at,
    input.last_search_at,
    input.search_attempts,
  );
  const row = db
    .prepare(
      "SELECT id FROM planner_episodes WHERE subscription_id = ? AND season_number = ? AND episode_number = ?",
    )
    .get(input.subscription_id, input.season_number, input.episode_number) as { id: number };
  return { ...input, id: row.id };
}

export function updateEpisode(
  id: number,
  input: Partial<PlannerEpisode>,
): PlannerEpisode | undefined {
  const db = useDatabase();
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === "id") continue;
    fields.push(`${key} = ?`);
    if (typeof value === "boolean") params.push(value ? 1 : 0);
    else params.push(value);
  }
  if (fields.length === 0) return undefined;
  params.push(id);
  db.prepare(`UPDATE planner_episodes SET ${fields.join(", ")} WHERE id = ?`).run(
    ...(params as unknown as Parameters<ReturnType<typeof db.prepare>["run"]>),
  );
  return db
    .prepare("SELECT * FROM planner_episodes WHERE id = ?")
    .get(id) as unknown as PlannerEpisode | undefined;
}

// ─── Movies ─────────────────────────────────────────────────────────────────

export function getMovieBySubscription(subscriptionId: number): PlannerMovie | undefined {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_movies WHERE subscription_id = ?")
    .get(subscriptionId) as unknown as PlannerMovie | undefined;
}

export function upsertMovie(input: PlannerMovie): PlannerMovie {
  const db = useDatabase();
  db.prepare(
    `INSERT INTO planner_movies
      (subscription_id, tmdb_id, imdb_id, digital_release_date, theatrical_release_date, status,
       file_path, downloaded_quality, grabbed_at, downloaded_at,
       last_discovery_at, discovery_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(subscription_id) DO UPDATE SET
       tmdb_id = excluded.tmdb_id,
       imdb_id = excluded.imdb_id,
       digital_release_date = excluded.digital_release_date,
       theatrical_release_date = excluded.theatrical_release_date,
       status = excluded.status,
       file_path = excluded.file_path,
       downloaded_quality = excluded.downloaded_quality,
       grabbed_at = excluded.grabbed_at,
       downloaded_at = excluded.downloaded_at,
       last_discovery_at = excluded.last_discovery_at,
       discovery_attempts = excluded.discovery_attempts`,
  ).run(
    input.subscription_id,
    input.tmdb_id,
    input.imdb_id,
    input.digital_release_date,
    input.theatrical_release_date,
    input.status,
    input.file_path,
    input.downloaded_quality,
    input.grabbed_at,
    input.downloaded_at,
    input.last_discovery_at,
    input.discovery_attempts,
  );
  return getMovieBySubscription(input.subscription_id)!;
}

// ─── Quality profiles ───────────────────────────────────────────────────────

export function listQualityProfiles(): PlannerQualityProfile[] {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_quality_profiles ORDER BY id ASC")
    .all() as unknown as PlannerQualityProfile[];
}

function getQualityProfile(id: number): PlannerQualityProfile | undefined {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_quality_profiles WHERE id = ?")
    .get(id) as unknown as PlannerQualityProfile | undefined;
}

export function createQualityProfile(input: {
  name: string;
  qualities_json: string;
  cutoff: string;
  upgrade_until?: string | null;
  min_size_mb?: number | null;
  max_size_mb?: number | null;
  is_default?: boolean;
}): PlannerQualityProfile {
  const db = useDatabase();
  if (input.is_default) {
    db.prepare("UPDATE planner_quality_profiles SET is_default = 0").run();
  }
  const result = db
    .prepare(
      `INSERT INTO planner_quality_profiles
        (name, is_default, qualities_json, cutoff, upgrade_until, min_size_mb, max_size_mb)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.is_default ? 1 : 0,
      input.qualities_json,
      input.cutoff,
      input.upgrade_until ?? null,
      input.min_size_mb ?? null,
      input.max_size_mb ?? null,
    );
  return getQualityProfile(Number(result.lastInsertRowid))!;
}

export function deleteQualityProfile(id: number): boolean {
  const db = useDatabase();
  const result = db
    .prepare("DELETE FROM planner_quality_profiles WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ─── Language profiles ──────────────────────────────────────────────────────

export function listLanguageProfiles(): PlannerLanguageProfile[] {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_language_profiles ORDER BY id ASC")
    .all() as unknown as PlannerLanguageProfile[];
}

function getLanguageProfile(id: number): PlannerLanguageProfile | undefined {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_language_profiles WHERE id = ?")
    .get(id) as unknown as PlannerLanguageProfile | undefined;
}

export function createLanguageProfile(input: {
  name: string;
  must_have_json?: string | null;
  must_not_have_json?: string | null;
  is_default?: boolean;
}): PlannerLanguageProfile {
  const db = useDatabase();
  if (input.is_default) {
    db.prepare("UPDATE planner_language_profiles SET is_default = 0").run();
  }
  const result = db
    .prepare(
      `INSERT INTO planner_language_profiles (name, is_default, must_have_json, must_not_have_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.is_default ? 1 : 0,
      input.must_have_json ?? null,
      input.must_not_have_json ?? null,
    );
  return getLanguageProfile(Number(result.lastInsertRowid))!;
}

export function deleteLanguageProfile(id: number): boolean {
  const db = useDatabase();
  const result = db
    .prepare("DELETE FROM planner_language_profiles WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ─── Indexers ───────────────────────────────────────────────────────────────

export function listIndexers(opts: { enabled?: boolean } = {}): PlannerIndexer[] {
  const db = useDatabase();
  let sql = "SELECT * FROM planner_indexers";
  const params: unknown[] = [];
  if (opts.enabled !== undefined) {
    sql += " WHERE enabled = ?";
    params.push(opts.enabled ? 1 : 0);
  }
  sql += " ORDER BY priority DESC, name ASC";
  return db.prepare(sql).all(...(params as any)) as unknown as PlannerIndexer[];
}

function getIndexer(id: number): PlannerIndexer | undefined {
  const db = useDatabase();
  return db
    .prepare("SELECT * FROM planner_indexers WHERE id = ?")
    .get(id) as unknown as PlannerIndexer | undefined;
}

export function createIndexer(input: {
  name: string;
  kind: PlannerIndexerKind;
  base_url: string;
  api_key?: string | null;
  enabled?: boolean;
  priority?: number;
}): PlannerIndexer {
  const db = useDatabase();
  const result = db
    .prepare(
      `INSERT INTO planner_indexers (name, kind, base_url, api_key, enabled, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.kind,
      input.base_url,
      input.api_key ?? null,
      input.enabled === false ? 0 : 1,
      input.priority ?? 25,
    );
  return getIndexer(Number(result.lastInsertRowid))!;
}

export function updateIndexer(
  id: number,
  input: Partial<Omit<PlannerIndexer, "id" | "added_at">>,
): PlannerIndexer | undefined {
  const db = useDatabase();
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    if (typeof value === "boolean") params.push(value ? 1 : 0);
    else params.push(value);
  }
  if (fields.length === 0) return getIndexer(id);
  params.push(id);
  db.prepare(`UPDATE planner_indexers SET ${fields.join(", ")} WHERE id = ?`).run(
    ...(params as unknown as Parameters<ReturnType<typeof db.prepare>["run"]>),
  );
  return getIndexer(id);
}

export function deleteIndexer(id: number): boolean {
  const db = useDatabase();
  const result = db
    .prepare("DELETE FROM planner_indexers WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ─── Search history ─────────────────────────────────────────────────────────

export function recordSearchHistory(input: Omit<PlannerSearchHistory, "id">): PlannerSearchHistory {
  const db = useDatabase();
  const result = db
    .prepare(
      `INSERT INTO planner_search_history
        (subscription_id, episode_id, movie_id, service, search_kind, query,
         results_count, picked_release, picked_title, picked_quality,
         picked_size_mb, picked_hash, picked_seeds, picked_at, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.subscription_id,
      input.episode_id,
      input.movie_id,
      input.service,
      input.search_kind,
      input.query,
      input.results_count,
      input.picked_release,
      input.picked_title,
      input.picked_quality,
      input.picked_size_mb,
      input.picked_hash,
      input.picked_seeds,
      input.picked_at,
      input.status,
      input.error_message,
    );
  return db
    .prepare("SELECT * FROM planner_search_history WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as unknown as PlannerSearchHistory;
}

// ─── Grab queue ─────────────────────────────────────────────────────────────

export function enqueueGrab(input: Omit<PlannerGrabQueueEntry, "id" | "state" | "attempts" | "last_error" | "created_at">): PlannerGrabQueueEntry {
  const db = useDatabase();

  // Anti double-grab: si ya hay un grab pending/dispatched para el mismo
  // episode o movie con el mismo hash, no encolar de nuevo.
  const key = input.release_hash ?? `${input.episode_id ?? input.movie_id}:${input.release_title}`;
  const existing = db
    .prepare(
      `SELECT id FROM planner_grab_queue
       WHERE release_hash = ? AND state IN ('pending', 'dispatched')
       LIMIT 1`,
    )
    .get(key) as { id: number } | undefined;
  if (existing) {
    return db
      .prepare("SELECT * FROM planner_grab_queue WHERE id = ?")
      .get(existing.id) as unknown as PlannerGrabQueueEntry;
  }

  const result = db
    .prepare(
      `INSERT INTO planner_grab_queue
        (subscription_id, episode_id, movie_id, release_title, release_url,
         release_hash, release_quality, release_size_mb, release_seeds,
         service, priority, state, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'))`,
    )
    .run(
      input.subscription_id,
      input.episode_id ?? null,
      input.movie_id ?? null,
      input.release_title,
      input.release_url,
      input.release_hash ?? null,
      input.release_quality,
      input.release_size_mb ?? null,
      input.release_seeds ?? null,
      input.service,
      input.priority ?? "normal",
    );
  const id = Number(result.lastInsertRowid);
  return db
    .prepare("SELECT * FROM planner_grab_queue WHERE id = ?")
    .get(id) as unknown as PlannerGrabQueueEntry;
}

export function nextPendingGrabs(limit: number = 5): PlannerGrabQueueEntry[] {
  const db = useDatabase();
  // Higher priority first: 'manual' > 'high' > 'normal'
  return db
    .prepare(
      `SELECT * FROM planner_grab_queue WHERE state = 'pending'
       ORDER BY
         CASE priority WHEN 'manual' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT ?`,
    )
    .all(limit) as unknown as PlannerGrabQueueEntry[];
}

export function updateGrabState(
  id: number,
  state: PlannerGrabState,
  error?: string,
): void {
  const db = useDatabase();
  if (error !== undefined) {
    db.prepare(
      "UPDATE planner_grab_queue SET state = ?, last_error = ?, attempts = attempts + 1 WHERE id = ?",
    ).run(state, error, id);
  } else {
    db.prepare(
      "UPDATE planner_grab_queue SET state = ?, attempts = attempts + 1 WHERE id = ?",
    ).run(state, id);
  }
}

// ─── Metadata cache ─────────────────────────────────────────────────────────

export function getMetadataCache(
  source: string,
  externalId: string,
  endpoint: string,
): PlannerMetadataCacheEntry | undefined {
  const db = useDatabase();
  const row = db
    .prepare(
      `SELECT * FROM planner_metadata_cache
       WHERE source = ? AND external_id = ? AND endpoint = ?
         AND expires_at > datetime('now')`,
    )
    .get(source, externalId, endpoint) as unknown as
    | PlannerMetadataCacheEntry
    | undefined;
  return row;
}

export function setMetadataCache(
  source: string,
  externalId: string,
  endpoint: string,
  payload: string,
  ttlSeconds: number,
): void {
  const db = useDatabase();
  db.prepare(
    `INSERT INTO planner_metadata_cache
        (source, external_id, endpoint, payload_json, fetched_at, expires_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'))
     ON CONFLICT(source, external_id, endpoint) DO UPDATE SET
       payload_json = excluded.payload_json,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  ).run(source, externalId, endpoint, payload, ttlSeconds);
}

// ─── Calendar helpers ───────────────────────────────────────────────────────

export interface CalendarEpisodeRow extends PlannerEpisode {
  subscription_title: string;
  subscription_poster: string | null;
}

/** Episodios de series monitorizadas cuyo air_date cae en [from, to]. */
export function getEpisodesByAirDateRange(
  from: string,
  to: string,
): CalendarEpisodeRow[] {
  const db = useDatabase();
  const rows = db
    .prepare(
      `SELECT e.*, s.title AS subscription_title, s.poster_url AS subscription_poster
       FROM planner_episodes e
       JOIN planner_subscriptions s ON s.id = e.subscription_id
       WHERE e.air_date IS NOT NULL
         AND e.air_date >= ?
         AND e.air_date <= ?
         AND s.monitored = 1
       ORDER BY e.air_date ASC`,
    )
    .all(from, to) as unknown as CalendarEpisodeRow[];
  return rows;
}

/**
 * Episodios listos para la búsqueda automática:
 *   - sin `force`: solo `waiting` que ya han emitido (air_date <= cutoff, regla 18:00).
 *   - con `force`: también `released` (emitidos, descarga manual) — "descarga automática".
 */
export function getEpisodesReadyForDownload(cutoff: string, force = false): PlannerEpisode[] {
  const db = useDatabase();
  const statusClause = force ? "e.status IN ('waiting', 'released')" : "e.status = 'waiting'";
  return db
    .prepare(
      `SELECT e.*, s.title AS subscription_title, s.poster_url AS subscription_poster
       FROM planner_episodes e
       JOIN planner_subscriptions s ON s.id = e.subscription_id
       WHERE ${statusClause}
         AND e.monitored = 1
         AND s.monitored = 1
         AND e.air_date IS NOT NULL
         AND e.air_date <= ?
         AND e.file_path IS NULL
       ORDER BY e.air_date ASC`,
    )
    .all(cutoff) as unknown as PlannerEpisode[];
}

/** Episodios emitidos (`released`) sin descargar — para la vista "Pendientes". */
export function getMissingEpisodes(): PlannerEpisode[] {
  const db = useDatabase();
  return db
    .prepare(
      `SELECT e.*, s.title AS subscription_title, s.poster_url AS subscription_poster
       FROM planner_episodes e
       JOIN planner_subscriptions s ON s.id = e.subscription_id
       WHERE e.status = 'released'
         AND s.monitored = 1
       ORDER BY e.air_date ASC`,
    )
    .all() as unknown as PlannerEpisode[];
}

// ─── Fecha local ─────────────────────────────────────────────────────────────

/** Fecha local YYYY-MM-DD (no UTC) — base para la regla de las 18:00 del estreno. */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Estado "pre-descarga" de un episodio según su fecha de aire:
 *   - air_date >= hoy  → 'waiting'  (en espera, se auto-descarga a las 18:00)
 *   - air_date <  hoy  → 'released' (emitido, descarga manual)
 *   - air_date null    → 'unreleased' (sin fecha anunciada)
 * Los estados de ciclo de vida (grabbed/downloaded/failed/cutoff_unmet) se
 * preservan. `wanted` (estado legacy, ya no se usa) también se recalcula para
 * migrar episodios antiguos que quedaron en ese estado.
 */
export function computeEpisodeStatus(
  existingStatus: PlannerEpisodeStatus | undefined,
  airDate: string | null,
  today: string,
): PlannerEpisodeStatus {
  const PRE = new Set<string>(["unreleased", "released", "waiting", "wanted"]);
  if (existingStatus && !PRE.has(existingStatus)) return existingStatus;
  if (airDate == null) return "unreleased";
  return airDate >= today ? "waiting" : "released";
}

/**
 * Estado "pre-descarga" de una película según su fecha de estreno:
 *   - releaseDate null   → 'unreleased' (sin fecha anunciada)
 *   - releaseDate >= hoy → 'waiting'   (en espera del estreno)
 *   - releaseDate <  hoy → 'released'  (emitida, descarga manual)
 * Los estados de ciclo de vida (grabbed/downloaded/failed/cutoff_unmet) se
 * preservan. `available`/`wanted` (estados legacy) también se recalculan para
 * migrar películas antiguas que quedaron en ese estado.
 */
export function computeMovieStatus(
  existingStatus: PlannerMovieStatus | undefined,
  releaseDate: string | null,
  today: string,
): PlannerMovieStatus {
  const PRE = new Set<string>(["unreleased", "waiting", "released", "available", "wanted"]);
  if (existingStatus && !PRE.has(existingStatus)) return existingStatus;
  if (releaseDate == null) return "unreleased";
  return releaseDate >= today ? "waiting" : "released";
}
