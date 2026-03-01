defineRouteMeta({
  openAPI: {
    tags: ["Users"],
    summary: "System status",
    description:
      "Check if any users have been created. Used by the frontend to decide whether to show the setup page or the login page.",
    responses: {
      200: {
        description: "System status",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                hasUsers: { type: "boolean" },
                userCount: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
});

export default defineEventHandler(() => {
  const count = getUserCount();
  return { hasUsers: count > 0, userCount: count };
});
