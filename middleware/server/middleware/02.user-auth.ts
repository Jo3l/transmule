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

  // Require Bearer token
  const auth = getHeader(event, "authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid or expired token",
    });
  }

  // Attach user to event context
  event.context.user = payload;
});
