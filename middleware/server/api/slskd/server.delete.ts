defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Disconnect from Soulseek server",
    description: "Disconnects from the Soulseek server.",
    responses: {
      200: { description: "Disconnected" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const ok = await client.disconnect("disconnected from TransMule");
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd disconnect error: ${err.message}`,
    });
  }
});
