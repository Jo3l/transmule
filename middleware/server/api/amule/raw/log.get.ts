defineRouteMeta({
  openAPI: {
    tags: ["Raw"],
    summary: "Raw log content",
    description: "Return log messages from the aMule EC stats endpoint.",
    responses: {
      200: { description: "Raw log data" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  try {
    const client = useAmuleClient();
    const stats = await client.getStats();
    return {
      messages: stats.loggerMessage || [],
      text: (stats.loggerMessage || []).join("\n"),
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
