defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Connect to Soulseek server",
    description: "Initiates a connection to the Soulseek server via slskd.",
    responses: {
      200: { description: "Connected" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const ok = await client.connect();
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd connect error: ${err.message}`,
    });
  }
});
