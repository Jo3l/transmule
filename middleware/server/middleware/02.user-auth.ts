/**
 * JWT authentication middleware.
 *
 * - Skips non-API routes (Swagger UI, OpenAPI spec, static assets)
 * - Skips public user routes: /api/users/login, /api/users/setup, /api/users/status
 * - All other /api/* routes require a valid Bearer token
 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;

  // Only protect /api/ routes
  if (!path.startsWith("/api/")) return;

  // Public (unauthenticated) routes
  const publicRoutes = [
    "/api/users/login",
    "/api/users/setup",
    "/api/users/status",
    "/api/ports",
  ];
  if (publicRoutes.some((r) => path === r)) return;

  // Allow ?token= query parameter for file download endpoint
  // (browser anchor tags can't set Authorization headers)
  if (path === "/api/files/download") {
    const qToken = getRequestURL(event).searchParams.get("token");
    if (qToken) {
      const payload = verifyToken(qToken);
      if (!payload) {
        throw createError({ statusCode: 401, statusMessage: "Invalid token" });
      }
      event.context.user = payload;
      return;
    }
  }

  // Accept JWT from Authorization: Bearer header OR auth_token cookie.
  // Cookie transport avoids conflicts when an nginx reverse proxy uses
  // HTTP Basic auth (which also occupies the Authorization header).
  const authHeader = getHeader(event, "authorization");
  let rawToken: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    rawToken = authHeader.slice(7);
  } else {
    rawToken = getCookie(event, "auth_token") ?? null;
  }
  if (!rawToken) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const payload = verifyToken(rawToken);
  if (!payload) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid or expired token",
    });
  }

  // Attach user to event context
  event.context.user = payload;
});
