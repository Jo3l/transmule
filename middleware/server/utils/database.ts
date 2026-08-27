/**
 * SQLite database for user authentication and middleware configuration.
 *
 * Tables:
 *  - users    — local user accounts (independent from aMule password)
 *  - config   — key/value settings (aMule URL, password, etc.)
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

let _db: DatabaseSync | null = null;

export function useDatabase(): DatabaseSync {
  if (!_db) {
    const dbPath =
      process.env.NITRO_DB_PATH || resolve("data", "amule-middleware.db");
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    _db = new DatabaseSync(dbPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    _initSchema(_db);
  }
  return _db;
}

function _initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin   INTEGER DEFAULT 0,
      created_at TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER NOT NULL,
      key     TEXT    NOT NULL,
      value   TEXT    NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS download_history (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  INTEGER NOT NULL,
      url      TEXT    NOT NULL,
      title    TEXT,
      service  TEXT    NOT NULL,
      sent_at  TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_download_history_user ON download_history(user_id);
    CREATE TABLE IF NOT EXISTS plugin_repositories (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      url      TEXT    UNIQUE NOT NULL,
      name     TEXT,
      added_at TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS plugin_repo_sources (
      plugin_id  TEXT    PRIMARY KEY,
      repo_id    INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES plugin_repositories(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS plugin_kv (
      plugin_id  TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (plugin_id, key)
    );

    -- ─── Planner schema ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS planner_subscriptions (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      type                TEXT    NOT NULL CHECK(type IN ('series', 'movie')),
      tmdb_id             INTEGER,
      tvdb_id             INTEGER,
      imdb_id             TEXT,
      title               TEXT    NOT NULL,
      year                INTEGER,
      poster_url          TEXT,
      overview            TEXT,
      genres_json         TEXT,
      status              TEXT    NOT NULL,                  -- 'continuing' | 'ended' | 'released'
      monitored           INTEGER DEFAULT 1,
      min_quality         TEXT    NOT NULL DEFAULT 'fullhd', -- 'uhd' | 'fullhd' | 'hd' | 'sd'
      max_size_mb         INTEGER,                           -- tamaño objetivo en MB (NULL = sin límite)
      root_folder         TEXT    NOT NULL,
      search_services_json TEXT,                             -- JSON array of provider ids
      language            TEXT,                             -- código ISO de idioma preferido (NULL = cualquiera)
      parent_subscription_id INTEGER,
      season_filter       INTEGER,                          -- NULL = all seasons
      added_at            TEXT    DEFAULT (datetime('now')),
      ended_at            TEXT,
      metadata_synced_at  TEXT,
      metadata_json       TEXT,
      FOREIGN KEY (parent_subscription_id) REFERENCES planner_subscriptions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_planner_subs_type ON planner_subscriptions(type);
    CREATE INDEX IF NOT EXISTS idx_planner_subs_tmdb ON planner_subscriptions(tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_planner_subs_tvdb ON planner_subscriptions(tvdb_id);
    CREATE INDEX IF NOT EXISTS idx_planner_subs_parent ON planner_subscriptions(parent_subscription_id);

    CREATE TABLE IF NOT EXISTS planner_seasons (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      season_number   INTEGER NOT NULL,
      monitored       INTEGER DEFAULT 1,
      episode_count   INTEGER,
      aired_count     INTEGER,
      FOREIGN KEY (subscription_id) REFERENCES planner_subscriptions(id) ON DELETE CASCADE,
      UNIQUE(subscription_id, season_number)
    );

    CREATE TABLE IF NOT EXISTS planner_episodes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id  INTEGER NOT NULL,
      season_id        INTEGER NOT NULL,
      season_number    INTEGER NOT NULL,
      episode_number   INTEGER NOT NULL,
      absolute_number  INTEGER,
      title            TEXT,
      air_date         TEXT,
      runtime          INTEGER,
      monitored        INTEGER DEFAULT 1,
      status           TEXT    NOT NULL DEFAULT 'unreleased',
      file_path        TEXT,
      downloaded_quality TEXT,
      grabbed_at       TEXT,
      downloaded_at    TEXT,
      last_search_at   TEXT,
      search_attempts  INTEGER DEFAULT 0,
      FOREIGN KEY (subscription_id) REFERENCES planner_subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES planner_seasons(id) ON DELETE CASCADE,
      UNIQUE(subscription_id, season_number, episode_number)
    );
    CREATE INDEX IF NOT EXISTS idx_planner_ep_status ON planner_episodes(status);
    CREATE INDEX IF NOT EXISTS idx_planner_ep_air_date ON planner_episodes(air_date);
    CREATE INDEX IF NOT EXISTS idx_planner_ep_sub ON planner_episodes(subscription_id);

    CREATE TABLE IF NOT EXISTS planner_movies (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id    INTEGER NOT NULL UNIQUE,
      tmdb_id            INTEGER,
      imdb_id            TEXT,
      digital_release_date TEXT,
      theatrical_release_date TEXT,
      status             TEXT    NOT NULL DEFAULT 'unreleased',
      file_path          TEXT,
      downloaded_quality TEXT,
      grabbed_at         TEXT,
      downloaded_at      TEXT,
      last_discovery_at  TEXT,
      discovery_attempts INTEGER DEFAULT 0,
      FOREIGN KEY (subscription_id) REFERENCES planner_subscriptions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS planner_quality_profiles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    UNIQUE NOT NULL,
      is_default    INTEGER DEFAULT 0,
      qualities_json TEXT   NOT NULL,
      cutoff        TEXT    NOT NULL,
      upgrade_until TEXT,
      min_size_mb   INTEGER,
      max_size_mb   INTEGER,
      created_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS planner_language_profiles (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    UNIQUE NOT NULL,
      is_default      INTEGER DEFAULT 0,
      must_have_json  TEXT,
      must_not_have_json TEXT,
      created_at      TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS planner_search_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      episode_id      INTEGER,
      movie_id        INTEGER,
      service         TEXT    NOT NULL,
      search_kind     TEXT    NOT NULL,
      query           TEXT,
      results_count   INTEGER,
      picked_release  TEXT,
      picked_title    TEXT,
      picked_quality  TEXT,
      picked_size_mb  INTEGER,
      picked_hash     TEXT,
      picked_seeds    INTEGER,
      picked_at       TEXT    DEFAULT (datetime('now')),
      status          TEXT    NOT NULL,
      error_message   TEXT,
      FOREIGN KEY (subscription_id) REFERENCES planner_subscriptions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_planner_search_history_sub ON planner_search_history(subscription_id);
    CREATE INDEX IF NOT EXISTS idx_planner_search_history_at ON planner_search_history(picked_at);

    CREATE TABLE IF NOT EXISTS planner_grab_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      episode_id      INTEGER,
      movie_id        INTEGER,
      release_title   TEXT,
      release_url     TEXT    NOT NULL,
      release_hash    TEXT,
      release_quality TEXT,
      release_size_mb INTEGER,
      release_seeds   INTEGER,
      service         TEXT    NOT NULL,
      state           TEXT    NOT NULL DEFAULT 'pending',
      attempts        INTEGER DEFAULT 0,
      last_error      TEXT,
      priority        TEXT    NOT NULL DEFAULT 'normal',
      created_at      TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (subscription_id) REFERENCES planner_subscriptions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_planner_grab_queue_state ON planner_grab_queue(state);

    CREATE TABLE IF NOT EXISTS planner_indexers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    UNIQUE NOT NULL,
      kind            TEXT    NOT NULL,
      base_url        TEXT    NOT NULL,
      api_key         TEXT,
      enabled         INTEGER DEFAULT 1,
      priority        INTEGER DEFAULT 25,
      last_sync_at    TEXT,
      last_sync_status TEXT,
      added_at        TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS planner_metadata_cache (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      source       TEXT    NOT NULL,
      external_id  TEXT    NOT NULL,
      endpoint     TEXT    NOT NULL,
      payload_json TEXT    NOT NULL,
      fetched_at   TEXT    NOT NULL,
      expires_at   TEXT    NOT NULL,
      UNIQUE (source, external_id, endpoint)
    );
    CREATE INDEX IF NOT EXISTS idx_planner_metadata_cache_expires ON planner_metadata_cache(expires_at);
  `);

  // Migration (Fase 15): añadir columna `language` a subscriptions existentes.
  const subsCols = db
    .prepare("PRAGMA table_info(planner_subscriptions)")
    .all() as { name: string }[];
  if (!subsCols.some((c) => c.name === "language")) {
    db.exec("ALTER TABLE planner_subscriptions ADD COLUMN language TEXT");
  }
  if (!subsCols.some((c) => c.name === "max_size_mb")) {
    db.exec("ALTER TABLE planner_subscriptions ADD COLUMN max_size_mb INTEGER");
  }
  if (!subsCols.some((c) => c.name === "smart_rename")) {
    db.exec("ALTER TABLE planner_subscriptions ADD COLUMN smart_rename INTEGER NOT NULL DEFAULT 0");
  }
  if (!subsCols.some((c) => c.name === "plex_scan")) {
    db.exec("ALTER TABLE planner_subscriptions ADD COLUMN plex_scan INTEGER NOT NULL DEFAULT 0");
  }

  // Migration (estado películas): columna de estreno en cines (type 3),
  // usada como fecha de referencia cuando no hay estreno digital (type 4).
  const movieCols = db
    .prepare("PRAGMA table_info(planner_movies)")
    .all() as { name: string }[];
  if (!movieCols.some((c) => c.name === "theatrical_release_date")) {
    db.exec("ALTER TABLE planner_movies ADD COLUMN theatrical_release_date TEXT");
  }
}

// ─── Plugin repository helpers ───────────────────────────────────────────────

export interface PluginRepository {
  id: number;
  url: string;
  name: string | null;
  added_at: string;
}

export function getPluginRepositories(): PluginRepository[] {
  const db = useDatabase();
  return db
    .prepare(
      "SELECT id, url, name, added_at FROM plugin_repositories ORDER BY id ASC",
    )
    .all() as PluginRepository[];
}

export function getPluginRepositoryByUrl(
  url: string,
): PluginRepository | undefined {
  const db = useDatabase();
  return db
    .prepare(
      "SELECT id, url, name, added_at FROM plugin_repositories WHERE url = ?",
    )
    .get(url) as PluginRepository | undefined;
}

export function addPluginRepository(
  url: string,
  name?: string,
): PluginRepository {
  const db = useDatabase();
  // Check if already exists — return existing record instead of failing
  const existing = db
    .prepare(
      "SELECT id, url, name, added_at FROM plugin_repositories WHERE url = ?",
    )
    .get(url) as PluginRepository | undefined;
  if (existing) {
    return existing;
  }
  db.prepare("INSERT INTO plugin_repositories (url, name) VALUES (?, ?)").run(
    url,
    name ?? null,
  );
  return db
    .prepare(
      "SELECT id, url, name, added_at FROM plugin_repositories WHERE url = ?",
    )
    .get(url) as PluginRepository;
}

export function removePluginRepository(id: number): boolean {
  const db = useDatabase();
  const result = db
    .prepare("DELETE FROM plugin_repositories WHERE id = ?")
    .run(id);
  return (result as any).changes > 0;
}

/** Record that a plugin was installed from a specific repository. */
export function setPluginRepoSource(pluginId: string, repoId: number): void {
  const db = useDatabase();
  db.prepare(
    "INSERT OR REPLACE INTO plugin_repo_sources (plugin_id, repo_id) VALUES (?, ?)",
  ).run(pluginId, repoId);
}

/** Return the repo id that installed this plugin, or null if manually installed. */
export function getPluginRepoSource(pluginId: string): number | null {
  const db = useDatabase();
  const row = db
    .prepare("SELECT repo_id FROM plugin_repo_sources WHERE plugin_id = ?")
    .get(pluginId) as { repo_id: number } | undefined;
  return row?.repo_id ?? null;
}

/** Return all plugin_ids that were installed from the given repo. */
export function getPluginIdsByRepo(repoId: number): string[] {
  const db = useDatabase();
  const rows = db
    .prepare("SELECT plugin_id FROM plugin_repo_sources WHERE repo_id = ?")
    .all(repoId) as { plugin_id: string }[];
  return rows.map((r) => r.plugin_id);
}

// ─── Config helpers ─────────────────────────────────────────────────────────

export function getConfig(key: string): string | undefined {
  const db = useDatabase();
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setConfig(key: string, value: string): void {
  const db = useDatabase();
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

// ─── User helpers ───────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export function getUserByUsername(username: string): DbUser | undefined {
  const db = useDatabase();
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | DbUser
    | undefined;
}

export function getUserById(id: number): DbUser | undefined {
  const db = useDatabase();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | DbUser
    | undefined;
}

export function getUserCount(): number {
  const db = useDatabase();
  return (
    db.prepare("SELECT COUNT(*) as count FROM users").get() as {
      count: number;
    }
  ).count;
}

export function getAllUsers(): Omit<DbUser, "password_hash">[] {
  const db = useDatabase();
  return db
    .prepare("SELECT id, username, is_admin, created_at FROM users")
    .all() as Omit<DbUser, "password_hash">[];
}

export function createUser(
  username: string,
  passwordHash: string,
  isAdmin: boolean = false,
): DbUser {
  const db = useDatabase();
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
    )
    .run(username, passwordHash, isAdmin ? 1 : 0);
  return getUserById(result.lastInsertRowid as number)!;
}

export function deleteUser(id: number): boolean {
  const db = useDatabase();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateUserPassword(id: number, passwordHash: string): boolean {
  const db = useDatabase();
  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, id);
  return result.changes > 0;
}

// ─── User preference helpers ────────────────────────────────────────────────

export function setUserPreference(
  userId: number,
  key: string,
  value: string,
): void {
  const db = useDatabase();
  db.prepare(
    "INSERT OR REPLACE INTO user_preferences (user_id, key, value) VALUES (?, ?, ?)",
  ).run(userId, key, value);
}

export function getAllUserPreferences(userId: number): Record<string, string> {
  const db = useDatabase();
  const rows = db
    .prepare("SELECT key, value FROM user_preferences WHERE user_id = ?")
    .all(userId) as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

// ─── Download history helpers ────────────────────────────────────────────────

export interface DownloadHistoryEntry {
  id: number;
  url: string;
  title: string | null;
  service: string;
  sent_at: string;
}

export function addDownloadEntry(
  userId: number,
  url: string,
  title: string,
  service: string,
): void {
  const db = useDatabase();
  // Check if the same URL was already recorded for this user
  const existing = db
    .prepare("SELECT id FROM download_history WHERE user_id = ? AND url = ?")
    .get(userId, url) as { id: number } | undefined;
  if (existing) {
    // Already exists — update the timestamp so it appears at the top
    db.prepare(
      "UPDATE download_history SET sent_at = datetime('now'), title = ?, service = ? WHERE id = ?",
    ).run(title || null, service, existing.id);
  } else {
    db.prepare(
      "INSERT INTO download_history (user_id, url, title, service) VALUES (?, ?, ?, ?)",
    ).run(userId, url, title || null, service);
  }
}

export function getDownloadedUrls(userId: number): string[] {
  const db = useDatabase();
  const rows = db
    .prepare(
      "SELECT url FROM download_history WHERE user_id = ? ORDER BY sent_at DESC LIMIT 500",
    )
    .all(userId) as { url: string }[];
  return rows.map((r) => r.url);
}

export function getDownloadHistoryItems(userId: number): { url: string; title: string | null }[] {
  const db = useDatabase();
  return db
    .prepare(
      "SELECT url, title FROM download_history WHERE user_id = ? ORDER BY sent_at DESC LIMIT 500",
    )
    .all(userId) as { url: string; title: string | null }[];
}

export function getDownloadHistoryCount(userId: number): number {
  const db = useDatabase();
  return (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM download_history WHERE user_id = ?",
      )
      .get(userId) as { count: number }
  ).count;
}

export function getDownloadHistoryPaginated(
  userId: number,
  limit: number,
  offset: number,
): DownloadHistoryEntry[] {
  const db = useDatabase();
  return db
    .prepare(
      "SELECT id, url, title, service, sent_at FROM download_history WHERE user_id = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?",
    )
    .all(userId, limit, offset) as DownloadHistoryEntry[];
}

export function deleteDownloadEntry(id: number, userId: number): boolean {
  const db = useDatabase();
  const result = db
    .prepare("DELETE FROM download_history WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}
