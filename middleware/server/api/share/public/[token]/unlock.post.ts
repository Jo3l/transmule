import { clientIp, loadShareByRef, shareSecret } from "../../../../utils/share-access";
import { describeRoots } from "../../../../utils/share-fs";
import { findShareByCode, type ShareRecord } from "../../../../utils/share-db";
import { hit, reset } from "../../../../utils/rate-limit";
import { isValidCode, normalizeCode, signShareTicket } from "../../../../utils/share-token";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

defineRouteMeta({
  openAPI: {
    tags: ["Shares (public)"],
    summary: "Exchange the share code for a short-lived ticket",
    parameters: [{ name: "token", in: "path", required: true }],
    responses: {
      200: { description: "Ticket plus the share roots" },
      401: { description: "Wrong code" },
      404: { description: "Unknown share" },
      410: { description: "Expired or revoked" },
      429: { description: "Too many attempts" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ref = decodeURIComponent(getRouterParam(event, "token") ?? "");
  const share: ShareRecord = loadShareByRef(ref);
  const body = await readBody(event).catch(() => ({} as Record<string, unknown>));
  const secret = shareSecret();

  if (share.hasCode) {
    const key = `unlock:${clientIp(event)}:${share.id}`;
    const limit = hit(key, MAX_ATTEMPTS, WINDOW_MS);
    if (!limit.allowed) {
      setHeader(event, "Retry-After", limit.retryAfterSeconds);
      throw createError({
        statusCode: 429,
        statusMessage: `Too many attempts. Retry in ${limit.retryAfterSeconds}s`,
      });
    }

    const code = normalizeCode(body?.code);
    const match = isValidCode(code) ? findShareByCode(code, secret) : null;
    if (!match || match.id !== share.id) {
      throw createError({ statusCode: 401, statusMessage: "Invalid code" });
    }
    reset(key);
  }

  setHeader(event, "Cache-Control", "private, no-store");
  return {
    ticket: signShareTicket(share.id, secret),
    label: share.label,
    kind: share.kind,
    expiresAt: share.expiresAt,
    roots: await describeRoots(share.roots),
  };
});
