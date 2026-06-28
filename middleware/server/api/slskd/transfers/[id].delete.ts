defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Cancel or remove a Soulseek transfer",
    description: "Cancels or removes a transfer by ID.",
    responses: {
      200: { description: "Transfer cancelled" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const id = getRouterParam(event, "id");
  const query = getQuery(event);

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing transfer id" });
  }

  const remove = query.remove === "true";

  try {
    const ok = await client.cancelTransfer(Number(id), remove);
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd transfer cancel error: ${err.message}`,
    });
  }
});
