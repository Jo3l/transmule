defineRouteMeta({
  openAPI: {
    tags: ["Shared Files"],
    summary: "List shared files",
    description:
      "Retrieve all shared files with per-session and all-time transfer statistics.",
    responses: {
      200: { description: "Shared files list with totals" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  try {
    const client = useAmuleClient();
    const sharedFiles = await client.getSharedFiles();

    const files = sharedFiles.map((f) => ({
      hash: f.fileHashHexString || hashToHex(f.hash),
      name: f.fileName || "Unknown",
      sizeFull: f.sizeFull || 0,
      size_fmt: formatBytes(f.sizeFull),
      xfer: f.getXferred || 0,
      xfer_fmt: formatBytes(f.getXferred),
      xfer_all: f.getAllXferred || 0,
      xfer_all_fmt: formatBytes(f.getAllXferred),
      req: f.getRequests || 0,
      req_all: f.getAllRequests || 0,
      accept: f.getAccepts || 0,
      accept_all: f.getAllAccepts || 0,
      priority: priorityLabel(f.upPrio),
      priorityValue: f.upPrio ?? 0,
      completeSources: f.getCompleteSources || 0,
      comment: f.getComment || "",
      rating: f.getRating || 0,
      onQueue: f.getOnQueue || 0,
    }));

    const totalSize = files.reduce((s, f) => s + f.sizeFull, 0);
    const totalXfer = files.reduce((s, f) => s + f.xfer, 0);
    const totalXferAll = files.reduce((s, f) => s + f.xfer_all, 0);

    return {
      shared: {
        count: files.length,
        files,
        totals: {
          size: totalSize,
          size_fmt: formatBytes(totalSize),
          xfer: totalXfer,
          xfer_fmt: formatBytes(totalXfer),
          xfer_all: totalXferAll,
          xfer_all_fmt: formatBytes(totalXferAll),
        },
      },
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
