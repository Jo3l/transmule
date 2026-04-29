defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad general configuration",
    description:
      "Returns the general configuration settings of the pyLoad server.",
    responses: {
      200: { description: "pyLoad configuration object" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = usePyLoadClient();
  const query = getQuery(event);
  const section = typeof query.section === "string" ? query.section : "core";
  const category =
    typeof query.category === "string" ? query.category : "download";
  const configOptions: Record<string, readonly string[]> = {
    download: [
      "chunks",
      "max_downloads",
      "max_speed",
      "limit_speed",
      "interface",
      "ipv6",
      "skip_existing",
      "start_time",
      "end_time",
    ],
    proxy: [
      "enabled",
      "host",
      "port",
      "type",
      "socks_resolve_dns",
      "username",
      "password",
    ],
    reconnect: ["enabled", "script", "start_time", "end_time"],
  };
  const options = configOptions[category];

  if (!options) {
    throw createError({
      statusCode: 400,
      statusMessage: "Unsupported pyLoad config category",
    });
  }

  try {
    const entries = await Promise.all(
      options.map(
        async (option) =>
          [
            option,
            await client.getConfigValue(category, option, section),
          ] as const,
      ),
    );

    return Object.fromEntries(entries);
  } catch (err: any) {
    console.error("Failed to fetch pyLoad config:", err);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch pyLoad config",
    });
  }
});
