/**
 * JWT utilities for user authentication.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import jwt from "jsonwebtoken";

/** Shipped defaults: never good enough to sign real tokens. */
const PLACEHOLDERS = new Set([
  "",
  "change-me",
  "change-me-to-a-random-string",
  "amule-middleware-change-this-secret-in-production",
]);

/**
 * Default in `nitro.config.ts`. Honoured outside production so a plain
 * `npm run dev` keeps a known secret; replaced by a generated one in
 * production, where a public secret would let anyone forge admin tokens.
 */
const DEV_DEFAULT = "amule-middleware-change-this-secret";

let _secret: string | null = null;

/** The middleware data dir (same one the SQLite database lives in). */
function dataDir(): string {
  return dirname(process.env.NITRO_DB_PATH || resolve("data", "amule-middleware.db"));
}

/**
 * Resolve the signing secret once, before any request is handled:
 * `NITRO_JWT_SECRET` → `<data>/.jwt_secret` → freshly generated (and persisted).
 *
 * This used to live in the container entrypoint; doing it here covers every
 * install path (installer, hand-pasted compose, plain `docker compose up`).
 */
export function initJwtSecret(): string {
  if (_secret) return _secret;

  const configured = String(useRuntimeConfig().jwtSecret ?? "").trim();
  const isProd = process.env.NODE_ENV === "production";
  const unusable = PLACEHOLDERS.has(configured) || (isProd && configured === DEV_DEFAULT);
  const file = join(dataDir(), ".jwt_secret");

  if (!unusable) {
    _secret = configured;
    return _secret;
  }

  if (existsSync(file)) {
    const saved = readFileSync(file, "utf8").trim();
    if (saved && !PLACEHOLDERS.has(saved)) {
      _secret = saved;
      console.log(`[jwt] loaded the signing secret from ${file}`);
      return _secret;
    }
  }

  const generated = randomBytes(32).toString("hex");
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, generated, { mode: 0o600 });
    console.log(`[jwt] generated a new signing secret → ${file}`);
  } catch (err: any) {
    console.warn(
      `[jwt] could not persist the signing secret to ${file} (${err?.message}); using it in memory only`,
    );
  }
  _secret = generated;
  return _secret;
}

function getSecret(): string {
  return _secret ?? initJwtSecret();
}

export interface JwtPayload {
  userId: number;
  username: string;
  isAdmin: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}
