defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Cancel or retry a transfer",
    description:
      "Deletes (cancels) a download or upload transfer by username and transfer ID. " +
      "Supports ?remove=true to also remove the file entry.",
    responses: {
      200: { description: "Transfer cancelled" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const params = getRouterParams(event);
  const query = getQuery(event);

  const username = params.username as string;
  const transferId = params.id as string;
  const direction = (query.direction as string) || "download";
  const remove = query.remove === "true";

  try {
    const ok = await client.cancelTransfer(username, transferId, direction, remove);
    if (!ok) {
      throw createError({
        statusCode: 502,
        statusMessage: "Failed to cancel transfer",
      });
    }
    return { success: true };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd cancel error: ${err.message}`,
    });
  }
});
