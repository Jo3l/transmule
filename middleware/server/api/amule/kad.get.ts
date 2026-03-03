defineRouteMeta({
  openAPI: {
    tags: ["KAD Network"],
    summary: "KAD status",
    description: "Get KAD network connection info from the stats endpoint.",
    responses: {
      200: { description: "KAD status" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  try {
    const client = useAmuleClient();
    const stats = await client.getStats();

    return {
      kad_status: {
        connected: !!stats.kadId,
        kadId: stats.kadId || null,
        kadUsers: stats.kadUsers || 0,
        kadFiles: stats.kadFiles || 0,
        kadNodes: stats.kadNodes || 0,
      },
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
