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
    // Record speed for the speed graph — count any transfer with actual
    // data flow, not just those with a specific state string.
    const totalSpeed = grouped
      ? (transfers as any[]).reduce(
          (sum: number, userGrp: any) => {
            for (const dir of (userGrp.directories ?? [])) {
              for (const f of (dir.files ?? [])) {
                const bytes = f.bytesTransferred || 0;
                const speed = f.averageSpeed || 0;
                if (bytes > 0 || speed > 0) sum += speed;
              }
            }
            return sum;
          },
          0,
        )
      : transfers.reduce(
          (sum: number, t: any) => {
            const bytes = t.bytesTransferred || 0;
            const speed = t.averageSpeed || 0;
            return sum + (bytes > 0 || speed > 0 ? speed : 0);
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
