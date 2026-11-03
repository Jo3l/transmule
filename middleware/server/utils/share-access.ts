/**
 * Access checks shared by the public share endpoints.
 *
 * Every handler that serves content under `/api/share/public/` must load the
 * share here (which enforces existence, expiry and revocation) and, when the
 * share is protected, verify the short-lived ticket.
 */

import type { H3Event } from "h3";
import { findShareById, findShareByToken, shareState, type ShareRecord } from "./share-db";
import { verifyShareTicket } from "./share-token";
import { initJwtSecret } from "./jwt";

/** Signing secret for tickets and code lookups (never leaves the server). */
export function shareSecret(): string {
  return initJwtSecret();
}

/** Load a share by its URL token, rejecting missing, expired and revoked ones. */
export function loadShareByToken(token: string): ShareRecord {
  const share = findShareByToken(token);
  if (!share) {
    throw createError({ statusCode: 404, statusMessage: "Share not found" });
  }
  return assertUsable(share);
}

/**
 * Public endpoints accept either the URL token (from the QR) or the share id
 * (used by the type-the-code flow). The id alone grants nothing: content
 * endpoints still require a ticket, which only `unlock` hands out.
 */
export function loadShareByRef(ref: string): ShareRecord {
  const byToken = findShareByToken(ref);
  if (byToken) return assertUsable(byToken);
  const byId = findShareById(ref);
  if (byId) return assertUsable(byId);
  throw createError({ statusCode: 404, statusMessage: "Share not found" });
}

function assertUsable(share: ShareRecord): ShareRecord {
  const state = shareState(share);
  if (state === "revoked") {
    throw createError({ statusCode: 410, statusMessage: "Share revoked" });
  }
  if (state === "expired") {
    throw createError({ statusCode: 410, statusMessage: "Share expired" });
  }
  return share;
}

/**
 * Content endpoints require the ticket handed out by `unlock`.
 * Codes are optional, but the ticket is not: it keeps the URL token alone from
 * being enough once a code has been set.
 */
export function requireShareTicket(event: H3Event, share: ShareRecord): void {
  const { t } = getQuery(event);
  const payload = verifyShareTicket(typeof t === "string" ? t : undefined, shareSecret());
  if (!payload || payload.share !== share.id) {
    throw createError({ statusCode: 403, statusMessage: "Unlock the share first" });
  }
}

/** Client IP for rate limiting, honouring X-Forwarded-For behind the proxy. */
export function clientIp(event: H3Event): string {
  return (
    getRequestIP(event, { xForwardedFor: true }) ||
    event.node.req.socket.remoteAddress ||
    "unknown"
  );
}
