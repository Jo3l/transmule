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
    const grouped = query.grouped === 'true';
    let transfers: any[];
    if (grouped) {
      const raw = await client.getTransfersGrouped(direction);
      transfers = raw;
    } else {
      transfers = await client.getTransfers(direction);
    }
    // Record speed for the speed graph (only active transfers)
    const totalSpeed = grouped
      ? (transfers as any[]).reduce(
          (sum: number, userGrp: any) => {
            const dirs = userGrp.directories ?? [];
            for (const dir of dirs) {
              for (const f of (dir.files ?? [])) {
                const state = f.state || "";
                const isActive = state.includes("InProgress") || state.includes("Transferring");
                if (isActive) sum += (f.averageSpeed || 0);
              }
            }
            return sum;
          },
          0,
        )
      : transfers.reduce(
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
