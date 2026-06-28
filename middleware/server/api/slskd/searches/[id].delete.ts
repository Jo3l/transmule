defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Remove a Soulseek search",
    description: "Removes a search and its results.",
    responses: {
      200: { description: "Search removed" },
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
    const ok = await client.removeSearch(id);
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd search remove error: ${err.message}`,
    });
  }
});
