defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get slskd Soulseek credentials",
    description:
      "Returns the stored Soulseek username and whether a password is set (authenticated users).",
    responses: {
      200: { description: "Credentials info" },
      403: { description: "Authentication required" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);

  return {
    username: getConfig("slskd_username") || "",
    hasPassword: !!getConfig("slskd_password"),
  };
});
