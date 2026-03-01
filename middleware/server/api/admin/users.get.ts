defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "List users",
    description: "List all registered users (admin only).",
    responses: {
      200: { description: "User list" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler((event) => {
  if (!event.context.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }
  return { users: getAllUsers() };
});
