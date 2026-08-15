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

/** Shared payload builder — also used by the unified downloads snapshot. */
export async function getSlskdTransfersPayload(
  direction: "download" | "upload",
  grouped: boolean,
) {
  const client = useSlskdClient();

  let transfers: any[];
  if (grouped) {
    transfers = await client.getTransfersGrouped(direction);
  } else {
    transfers = await client.getTransfers(direction);
  }

  // Record speed for the speed graph — only count files that are
  // actively transferring. slskd's averageSpeed is the lifetime
  // average, so completed/queued files would inflate the total.
  const isActive = (f: any) => {
    const state = f.state || "";
    const done = f.bytesTransferred || 0;
    const sz = f.size || 0;
    return (
      state.includes("InProgress") ||
      state.includes("Transferring") ||
      (done > 0 && sz > 0 && done < sz)
    );
  };
  const totalSpeed = grouped
    ? (transfers as any[]).reduce((sum: number, userGrp: any) => {
        for (const dir of userGrp.directories ?? []) {
          for (const f of dir.files ?? []) {
            if (isActive(f)) sum += f.averageSpeed || 0;
          }
        }
        return sum;
      }, 0)
    : transfers.reduce(
        (sum: number, t: any) => (isActive(t) ? sum + (t.averageSpeed || 0) : sum),
        0,
      );
  if (direction === "download") {
    updateServiceSpeed("slskd", totalSpeed);
  } else if (direction === "upload") {
    updateServiceUploadSpeed("slskd", totalSpeed);
  }
  return transfers;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const direction = (query.direction as string) === "upload" ? "upload" : "download";
  const grouped = query.grouped === "true";

  try {
    return await getSlskdTransfersPayload(direction, grouped);
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd transfers error: ${err.message}`,
    });
  }
});
