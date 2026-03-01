defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Get aMule connection config",
    description:
      "Retrieve the stored aMule EC host/port and whether a password is configured (admin only). The password itself is never returned.",
    responses: {
      200: { description: "Connection config" },
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

  const config = useRuntimeConfig();
  const client = useAmuleClient();

  return {
    amuleHost: getConfig("amule_host") || String(config.amuleHost),
    amulePort: Number(getConfig("amule_port") || config.amulePort),
    hasPassword: !!(getConfig("amule_password") || config.amulePassword),
    connection: client.connectionInfo,
  };
});
