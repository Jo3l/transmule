defineRouteMeta({
  openAPI: {
    tags: ["Torrents"],
    summary: "Torrent detail",
    description:
      "Return detailed info for a single torrent: files, peers, trackers, piece availability.",
    parameters: [
      {
        name: "id",
        in: "query",
        required: true,
        description: "Torrent ID (integer) or hash string.",
      },
    ],
    responses: {
      200: { description: "Torrent detail" },
      400: { description: "Missing id parameter" },
      404: { description: "Torrent not found" },
      502: { description: "Transmission connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const rawId = query.id;

  if (!rawId) {
    throw createError({
      statusCode: 400,
      statusMessage: "id query parameter is required",
    });
  }

  const id =
    typeof rawId === "string" && /^\d+$/.test(rawId) ? Number(rawId) : rawId;

  try {
    const client = useTransmissionClient();
    const torrent = await client.getTorrentDetail(id as number | string);

    if (!torrent) {
      throw createError({
        statusCode: 404,
        statusMessage: "Torrent not found",
      });
    }

    return { torrent };
  } catch (err: any) {
    if ((err as any).statusCode && (err as any).statusCode < 500) throw err;
    throw createError({
      statusCode: 503,
      statusMessage: `Transmission unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
