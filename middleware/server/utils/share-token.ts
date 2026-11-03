/**
 * Capability tokens and short codes for file shares.
 *
 * Deliberately free of Nitro auto-imports: everything is a pure function that
 * takes its inputs (secret included), so it can be unit-tested with plain
 * `node --test`.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

/** Unambiguous alphabet: no I, O, 0 or 1 — safe to read aloud or retype. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;

/** Download tickets are short-lived: they only cover one browsing session. */
export const SHARE_TICKET_TTL_MS = 15 * 60_000;

const SHARE_TICKET_SCOPE = "share";
const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 10;

function randomFrom(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** 256-bit capability token; goes in the URL and never in the QR payload alone. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Short human-readable code shown next to the QR. */
export function generateCode(): string {
  return randomFrom(CODE_ALPHABET, CODE_LENGTH);
}

/** Opaque database id (10 chars), used to list and revoke shares. */
export function generateShareId(): string {
  return randomFrom(ID_ALPHABET, ID_LENGTH);
}

/** Tokens are stored hashed; lookups hash the incoming token the same way. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Codes are stored as an HMAC keyed with the JWT secret.
 *
 * The code is short (6 chars), so a plain hash would be brute-forced offline in
 * seconds if the database ever leaked. Keying it with a secret that never
 * reaches the database makes that attack impossible; rotating the JWT secret
 * therefore invalidates existing codes (tokens keep working).
 */
export function hashCode(code: unknown, secret: string): string {
  return createHmac("sha256", secret).update(normalizeCode(code)).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** Accept "abc-234", "abc 234" and lowercase input; the code is case-insensitive. */
export function normalizeCode(input: unknown): string {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

export function isValidCode(input: unknown): boolean {
  const code = normalizeCode(input);
  return (
    code.length === CODE_LENGTH &&
    [...code].every((char) => CODE_ALPHABET.includes(char))
  );
}

export function newShareCredentials(): { token: string; code: string } {
  return { token: generateToken(), code: generateCode() };
}

export interface ShareTicketPayload {
  share: string;
}

/**
 * Short-lived proof that the visitor typed the share code. Signed with the
 * middleware JWT secret but with its own scope, so it can never be mistaken
 * for a user session token.
 */
export function signShareTicket(
  shareId: string,
  secret: string,
  ttlMs: number = SHARE_TICKET_TTL_MS,
): string {
  const expiresIn = Math.max(1, Math.floor(ttlMs / 1000));
  return jwt.sign({ scope: SHARE_TICKET_SCOPE, share: shareId }, secret, {
    expiresIn,
  });
}

export function verifyShareTicket(
  token: string | undefined,
  secret: string,
): ShareTicketPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as Record<string, unknown>;
    if (payload?.scope !== SHARE_TICKET_SCOPE) return null;
    if (typeof payload.share !== "string" || !payload.share) return null;
    return { share: payload.share };
  } catch {
    return null;
  }
}
