defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "List Soulseek transfers",
    description: "Returns transfers (downloads or uploads).",
    responses: {
      200: { description: "Transfer list" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const query = getQuery(event);
  const direction = (query.direction as string) === "upload" ? "upload" : "download";

  try {
    const transfers = await client.getTransfers(direction);
    // Record speed for the speed graph (only active transfers)
    const totalSpeed = transfers.reduce(
      (sum: number, t: any) => {
        const state = t.state || "";
        const isActive = state.includes("InProgress") || state.includes("Transferring");
        return sum + (isActive ? (t.averageSpeed || 0) : 0);
      },
      0,
    );
    if (direction === "download") {
      updateServiceSpeed("slskd", totalSpeed);
    } else if (direction === "upload") {
      updateServiceUploadSpeed("slskd", totalSpeed);
    }
    return transfers;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd transfers error: ${err.message}`,
    });
  }
});
