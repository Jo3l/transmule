defineRouteMeta({
  openAPI: {
    tags: ["Preferences"],
    summary: "Get aMule preferences",
    description:
      "Retrieve current aMule daemon preferences (General, Connection, Servers, Security) via EC protocol.",
    responses: {
      200: { description: "Current preferences" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  try {
    const client = useAmuleClient();
    return await client.getPreferences();
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
