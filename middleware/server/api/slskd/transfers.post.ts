defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Start a download",
    description:
      "Queue files for download from a Soulseek user. Uses the batch API (slskd 0.26.0+) when downloading multiple files (e.g. folders), falling back to the old single-enqueue endpoint.",
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
  const files: { filename: string; size: number }[] = body.files ?? [];

  if (!username || !files.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "username and files are required",
    });
  }

  try {
    // Use batch API for multiple files (folder downloads) — slskd 0.26.0+
    if (files.length > 1 && body.batchId) {
      const result = await client.enqueueDownloadBatch(username, files, {
        batchId: body.batchId,
        searchId: body.searchId,
      });
      if (!result.success) {
        throw createError({
          statusCode: 502,
          statusMessage: `slskd batch rejected: ${result.status}`,
        });
      }
      return { success: true, batch: true, batchId: body.batchId, details: result.body };
    }

    // Single file or legacy fallback
    const result = await client.startDownload(username, files);
    if (!result.success) {
      throw createError({
        statusCode: 502,
        statusMessage: `slskd rejected: ${result.response || "unknown error"}`,
      });
    }
    return { success: true, batch: false };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd download error: ${err.message}`,
    });
  }
});
