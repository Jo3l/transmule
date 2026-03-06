/**
 * SQLite database for user authentication and middleware configuration.
 *
 * Tables:
 *  - users    — local user accounts (independent from aMule password)
 *  - config   — key/value settings (aMule URL, password, etc.)
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

let _db: InstanceType<typeof Database> | null = null;

export function useDatabase(): InstanceType<typeof Database> {
  if (!_db) {
    const dbPath =
      process.env.NITRO_DB_PATH || resolve("data", "amule-middleware.db");
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _initSchema(_db);
  }
  return _db;
}

function _initSchema(db: InstanceType<typeof Database>): void {
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
  `);
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

export function getUserPreference(
  userId: number,
  key: string,
): string | undefined {
  const db = useDatabase();
  const row = db
    .prepare("SELECT value FROM user_preferences WHERE user_id = ? AND key = ?")
    .get(userId, key) as { value: string } | undefined;
  return row?.value;
}

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

export function getDownloadHistory(userId: number): DownloadHistoryEntry[] {
  const db = useDatabase();
  return db
    .prepare(
      "SELECT id, url, title, service, sent_at FROM download_history WHERE user_id = ? ORDER BY sent_at DESC",
    )
    .all(userId) as DownloadHistoryEntry[];
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
