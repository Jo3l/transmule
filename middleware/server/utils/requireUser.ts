import type { H3Event } from "h3";
import type { JwtPayload } from "./jwt";

/**
 * Asserts that the request has an authenticated user in the event context.
 * The global auth middleware (02.user-auth.ts) already enforces this, but
 * calling requireUser(event) inside each handler provides explicit
 * defense-in-depth.
 *
 * @throws 401 if event.context.user is not populated
 */
export function requireUser(event: H3Event): JwtPayload {
  if (!event.context.user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
  return event.context.user as JwtPayload;
}
