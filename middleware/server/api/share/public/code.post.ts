import { clientIp, shareSecret } from "../../../utils/share-access";
import { findShareByCode, shareState } from "../../../utils/share-db";
import { hit } from "../../../utils/rate-limit";
import { isValidCode, normalizeCode, signShareTicket } from "../../../utils/share-token";
import { describeRoots } from "../../../utils/share-fs";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 1000;

defineRouteMeta({
  openAPI: {
    tags: ["Shares (public)"],
    summary: "Resolve a typed code into a share (used by the /s entry page)",
    responses: {
      200: { description: "Share id, ticket and roots" },
      400: { description: "Malformed code" },
      404: { description: "No share with that code" },
      410: { description: "Expired or revoked" },
      429: { description: "Too many attempts" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const limit = hit(`code:${clientIp(event)}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!limit.allowed) {
    setHeader(event, "Retry-After", limit.retryAfterSeconds);
    throw createError({
      statusCode: 429,
      statusMessage: `Too many attempts. Retry in ${limit.retryAfterSeconds}s`,
    });
  }

  const body = await readBody(event).catch(() => ({} as Record<string, unknown>));
  const code = normalizeCode(body?.code);
  if (!isValidCode(code)) {
    throw createError({ statusCode: 400, statusMessage: "code must be 6 characters" });
  }

  const secret = shareSecret();
  const share = findShareByCode(code, secret);
  if (!share) {
    throw createError({ statusCode: 404, statusMessage: "No share with that code" });
  }

  const state = shareState(share);
  if (state === "revoked") {
    throw createError({ statusCode: 410, statusMessage: "Share revoked" });
  }
  if (state === "expired") {
    throw createError({ statusCode: 410, statusMessage: "Share expired" });
  }

  setHeader(event, "Cache-Control", "private, no-store");
  return {
    id: share.id,
    ticket: signShareTicket(share.id, secret),
    label: share.label,
    kind: share.kind,
    expiresAt: share.expiresAt,
    roots: await describeRoots(share.roots),
  };
});
