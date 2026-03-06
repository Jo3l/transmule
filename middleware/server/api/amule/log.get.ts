defineRouteMeta({
  openAPI: {
    tags: ["Logs"],
    summary: "Get logs",
    description:
      "Retrieve aMule log messages from the stats endpoint. " +
      "The EC protocol provides logger messages via the stats response.",
    responses: {
      200: { description: "Log content" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  try {
    const client = useAmuleClient();
    const stats = await client.getStats();

    // The EC protocol returns log messages via getStats().loggerMessage
    const messages = stats.loggerMessage || [];

    return {
      amule_log: {
        content: messages.join("\n"),
        lines: messages.length,
      },
      server_log: {
        content: stats.connectedServer
          ? `Connected to: ${stats.connectedServer.name || "Unknown"} (${stats.connectedServer.ip}:${stats.connectedServer.port})`
          : "Not connected to any server",
        lines: 1,
      },
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
