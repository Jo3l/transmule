defineRouteMeta({
  openAPI: {
    tags: ["Users"],
    summary: "Current user",
    description: "Return the authenticated user's profile from the JWT.",
    responses: {
      200: { description: "User profile" },
      401: { description: "Not authenticated" },
    },
  },
});

export default defineEventHandler((event) => {
  const user = event.context.user;
  return {
    id: user.userId,
    username: user.username,
    isAdmin: user.isAdmin,
  };
});
