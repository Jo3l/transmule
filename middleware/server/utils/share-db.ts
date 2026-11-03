/**
 * Persistence for file shares (QR / link delivery).
 *
 * Tokens are stored hashed (sha256) and codes as an HMAC keyed with the JWT
 * secret, so the database never contains anything that can be replayed.
 */

import { useDatabase } from "./database";
import { hashCode, hashToken, safeEqualHex } from "./share-token";

export type ShareKind = "file" | "folder" | "selection";
export type ShareState = "ok" | "expired" | "revoked";

export interface ShareRecord {
  id: string;
  kind: ShareKind;
  label: string;
  roots: string[];
  hasCode: boolean;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  downloads: number;
  revoked: boolean;
}

interface ShareRow {
  id: string;
  token_hash: string;
  code_hash: string | null;
  kind: string;
  label: string;
  roots: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  downloads: number;
  revoked: number;
}

function mapRow(row: ShareRow): ShareRecord {
  let roots: string[] = [];
  try {
    const parsed = JSON.parse(row.roots);
    if (Array.isArray(parsed)) roots = parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    roots = [];
  }
  return {
    id: row.id,
    kind: (row.kind as ShareKind) ?? "file",
    label: row.label,
    roots,
    hasCode: Boolean(row.code_hash),
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    downloads: Number(row.downloads) || 0,
    revoked: Number(row.revoked) === 1,
  };
}

const COLUMNS =
  "id, token_hash, code_hash, kind, label, roots, created_by, created_at, expires_at, downloads, revoked";

export function createShare(input: {
  id: string;
  token: string;
  codeHash: string | null;
  kind: ShareKind;
  label: string;
  roots: string[];
  createdBy: string | null;
  expiresAt: string;
}): ShareRecord {
  const db = useDatabase();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO shares (id, token_hash, code_hash, kind, label, roots, created_by, created_at, expires_at, downloads, revoked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
  ).run(
    input.id,
    hashToken(input.token),
    input.codeHash,
    input.kind,
    input.label,
    JSON.stringify(input.roots),
    input.createdBy,
    createdAt,
    input.expiresAt,
  );

  const created = findShareById(input.id);
  if (!created) throw new Error("share not persisted");
  return created;
}

export function findShareByToken(token: string): ShareRecord | null {
  if (!token) return null;
  const row = useDatabase()
    .prepare(`SELECT ${COLUMNS} FROM shares WHERE token_hash = ?`)
    .get(hashToken(token)) as unknown as ShareRow | undefined;
  return row ? mapRow(row) : null;
}

export function findShareById(id: string): ShareRecord | null {
  if (!id) return null;
  const row = useDatabase()
    .prepare(`SELECT ${COLUMNS} FROM shares WHERE id = ?`)
    .get(id) as unknown as ShareRow | undefined;
  return row ? mapRow(row) : null;
}

/** Resolve a typed code. The lookup is an indexed HMAC, never a scan. */
export function findShareByCode(code: string, secret: string): ShareRecord | null {
  if (!code) return null;
  const codeHash = hashCode(code, secret);
  const row = useDatabase()
    .prepare(`SELECT ${COLUMNS} FROM shares WHERE code_hash = ?`)
    .get(codeHash) as unknown as ShareRow | undefined;
  if (!row) return null;

  // Defense in depth: compare the digests in constant time as well.
  if (!row.code_hash || !safeEqualHex(row.code_hash, codeHash)) return null;
  return mapRow(row);
}

export function listShares(): ShareRecord[] {
  const rows = useDatabase()
    .prepare(`SELECT ${COLUMNS} FROM shares ORDER BY created_at DESC`)
    .all() as unknown as ShareRow[];
  return rows.map(mapRow);
}

export function revokeShare(id: string): boolean {
  const result = useDatabase()
    .prepare("UPDATE shares SET revoked = 1 WHERE id = ? AND revoked = 0")
    .run(id);
  return Number(result.changes) > 0;
}

export function incrementDownloads(id: string): void {
  useDatabase().prepare("UPDATE shares SET downloads = downloads + 1 WHERE id = ?").run(id);
}

export function shareState(share: ShareRecord, now: number = Date.now()): ShareState {
  if (share.revoked) return "revoked";
  const expiry = Date.parse(share.expiresAt);
  if (Number.isFinite(expiry) && expiry <= now) return "expired";
  return "ok";
}

/** Housekeeping: drop revoked shares older than `maxAgeMs` (kept for audit meanwhile). */
export function purgeStaleShares(maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const result = useDatabase()
    .prepare("DELETE FROM shares WHERE revoked = 1 AND expires_at < ?")
    .run(cutoff);
  return Number(result.changes) || 0;
}
