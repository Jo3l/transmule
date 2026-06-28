defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Rescan (reload) slskd shares",
    description: "Triggers a rescan of all Soulseek shares via PUT /shares.",
    responses: {
      200: { description: "Rescan triggered" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const ok = await client.rescanShares();
    if (!ok) {
      throw createError({
        statusCode: 502,
        statusMessage: "Failed to rescan slskd shares",
      });
    }
    return { success: true };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd rescan error: ${err.message}`,
    });
  }
});
