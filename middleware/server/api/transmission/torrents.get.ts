defineRouteMeta({
  openAPI: {
    tags: ["Torrents"],
    summary: "List Transmission torrents",
    description: "Return all torrents from the Transmission daemon.",
    responses: {
      200: { description: "Torrent list with session stats" },
      502: { description: "Transmission connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  try {
    const client = useTransmissionClient();

    const [torrents, stats] = await Promise.all([
      client.getTorrents(),
      client.getSessionStats(),
    ]);

    // Compute totals
    let totalDown = 0;
    let totalUp = 0;
    let totalSize = 0;
    let totalDone = 0;

    for (const t of torrents) {
      totalDown += t.rateDownload;
      totalUp += t.rateUpload;
      totalSize += t.sizeWhenDone;
      totalDone += t.sizeWhenDone - t.leftUntilDone;
    }

    updateServiceSpeed("torrent", totalDown);
    updateServiceUploadSpeed("torrent", totalUp);

    return {
      torrents: {
        count: torrents.length,
        files: torrents,
        totals: {
          speed_down: totalDown,
          speed_down_fmt: fmtSpeed(totalDown),
          speed_up: totalUp,
          speed_up_fmt: fmtSpeed(totalUp),
          size: totalSize,
          size_fmt: fmtBytes(totalSize),
          size_done: totalDone,
          size_done_fmt: fmtBytes(totalDone),
        },
      },
      session: stats,
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `Transmission unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});

function fmtBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function fmtSpeed(bps: number): string {
  if (!bps || bps === 0) return "0 B/s";
  return fmtBytes(bps) + "/s";
}
