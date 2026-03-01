defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "List downloads",
    description:
      "Retrieve all current downloads including status, speed, progress, sources, and transfer totals.",
    responses: {
      200: { description: "Downloads list with totals" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  const client = useAmuleClient();
  const queue = await client.getDownloadQueue();

  const files = queue.map((f) => {
    const progress =
      f.sizeFull && f.sizeFull > 0
        ? Math.round(((f.sizeDone || 0) / f.sizeFull) * 10000) / 100
        : 0;
    return {
      hash: f.fileHashHexString || hashToHex(f.hash),
      name: f.fileName || "Unknown",
      sizeFull: f.sizeFull || 0,
      sizeDone: f.sizeDone || 0,
      sizeXfer: f.sizeXfer || 0,
      speed: f.speed || 0,
      progress,
      status: fileStatusLabel(f.fileStatus, f.stopped),
      priority: priorityLabel(f.downPrio),
      priorityValue: f.downPrio ?? 0,
      sourceCount: f.sourceCount || 0,
      sourceCountXfer: f.sourceXferCount || 0,
      sourceCountA4AF: f.sourceCountA4AF || 0,
      ed2kLink: f.fileEd2kLink || "",
      category: f.fileCat ?? 0,
      partMetID: f.partMetID ?? 0,
      stopped: f.stopped ?? false,
      lastSeenComplete: f.lastSeenComplete || 0,
      // Formatted values
      size_fmt: formatBytes(f.sizeFull),
      size_done_fmt: formatBytes(f.sizeDone),
      speed_fmt: formatSpeed(f.speed),
    };
  });

  const totalSpeed = files.reduce((s, f) => s + f.speed, 0);
  const totalSize = files.reduce((s, f) => s + f.sizeFull, 0);
  const totalDone = files.reduce((s, f) => s + f.sizeDone, 0);

  return {
    downloads: {
      count: files.length,
      files,
      totals: {
        speed: totalSpeed,
        speed_fmt: formatSpeed(totalSpeed),
        size: totalSize,
        size_fmt: formatBytes(totalSize),
        size_done: totalDone,
        size_done_fmt: formatBytes(totalDone),
      },
    },
  };
});
