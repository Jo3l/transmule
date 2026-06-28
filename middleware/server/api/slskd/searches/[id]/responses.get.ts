defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get search responses",
    description: "Returns search results for a given search ID.",
    responses: {
      200: { description: "Search responses" },
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
    const responses = await client.getSearchResponses(id);
    return responses;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd search responses error: ${err.message}`,
    });
  }
});
