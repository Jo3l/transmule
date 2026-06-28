defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get slskd Soulseek credentials",
    description:
      "Returns the stored Soulseek username and whether a password is set (admin only).",
    responses: {
      200: { description: "Credentials info" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler((event) => {
  requireAdmin(event);

  return {
    username: getConfig("slskd_username") || "",
    hasPassword: !!getConfig("slskd_password"),
  };
});
