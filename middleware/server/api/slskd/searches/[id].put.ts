defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Stop a Soulseek search",
    description: "Stops an in-progress search.",
    responses: {
      200: { description: "Search stopped" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing search id" });
  }

  try {
    const ok = await client.stopSearch(id);
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd search stop error: ${err.message}`,
    });
  }
});
