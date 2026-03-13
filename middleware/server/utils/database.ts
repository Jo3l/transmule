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
  `);
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

export function addPluginRepository(
  url: string,
  name?: string,
): PluginRepository {
  const db = useDatabase();
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

/** Remove the repo-source record for a plugin. */
export function clearPluginRepoSource(pluginId: string): void {
  const db = useDatabase();
  db.prepare("DELETE FROM plugin_repo_sources WHERE plugin_id = ?").run(
    pluginId,
  );
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
  db.prepare(
    "INSERT INTO download_history (user_id, url, title, service) VALUES (?, ?, ?, ?)",
  ).run(userId, url, title || null, service);
}

export function getDownloadedUrls(userId: number): string[] {
  const db = useDatabase();
  const rows = db
    .prepare(
      "SELECT url FROM download_history WHERE user_id = ? ORDER BY sent_at DESC LIMIT 50",
    )
    .all(userId) as { url: string }[];
  return rows.map((r) => r.url);
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
