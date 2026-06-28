defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Start a download",
    description: "Queue a file for download from a Soulseek user.",
    responses: {
      200: { description: "Download queued" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const body = await readBody(event);

  const username = body.username;
  const files = body.files ?? [];

  if (!username || !files.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "username and files are required",
    });
  }

  try {
    const result = await client.startDownload(username, files);
    if (!result.success) {
      throw createError({
        statusCode: 502,
        statusMessage: `slskd rejected: ${result.response || "unknown error"}`,
      });
    }
    return { success: true };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd download error: ${err.message}`,
    });
  }
});
