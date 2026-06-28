defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Create Soulseek search",
    description: "Starts a new search on the Soulseek network.",
    responses: {
      200: { description: "Search created" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const body = await readBody(event);

  if (!body?.searchText) {
    throw createError({ statusCode: 400, statusMessage: "searchText is required" });
  }

  const id = body.id || crypto.randomUUID();

  try {
    const ok = await client.createSearch(id, body.searchText);
    return { success: ok, id };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd search create error: ${err.message}`,
    });
  }
});
