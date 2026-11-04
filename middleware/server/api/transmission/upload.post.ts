import { MAX_TORRENT_BYTES, validateTorrentMetainfo } from "../../utils/torrent-metainfo";

defineRouteMeta({
  openAPI: {
    tags: ["Torrents"],
    summary: "Upload a .torrent file (maximum 5 MiB)",
    description: "Authenticated binary application/x-bittorrent body. Query: filename, paused (true/false). Uses Transmission's configured download directory. Returns torrent and duplicate status.",
    responses: {
      200: { description: "Torrent added or already present" },
      400: { description: "Invalid filename, options or metainfo" },
      401: { description: "Authentication required" },
      413: { description: "File exceeds 5 MiB" },
      415: { description: "Unsupported content type" },
      503: { description: "Transmission unavailable" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const query = getQuery(event);
  if (Object.keys(query).some((key) => !["filename", "paused"].includes(key)) ||
      typeof query.filename !== "string" || !/\.torrent$/i.test(query.filename) ||
      /[\x00/\\]/.test(query.filename) ||
      (query.paused !== undefined && !["true", "false"].includes(query.paused as string))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid torrent filename or options" });
  }
  const contentType = getHeader(event, "content-type")?.split(";")[0].trim().toLowerCase();
  if (!["application/x-bittorrent", "application/octet-stream"].includes(contentType || "")) {
    throw createError({ statusCode: 415, statusMessage: "Expected a .torrent file" });
  }
  const tooLarge = () => createError({ statusCode: 413, statusMessage: "Torrent file exceeds 5 MiB" });
  if (Number(getHeader(event, "content-length")) > MAX_TORRENT_BYTES) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  // Bound actual bytes too: Content-Length may be absent (chunked requests).
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_TORRENT_BYTES) {
      event.node.req.resume();
      throw tooLarge();
    }
    chunks.push(buffer);
  }
  const data = Buffer.concat(chunks, size);
  validateTorrentMetainfo(data);
  try {
    const torrent = await useTransmissionClient().addTorrent({
      metainfo: data.toString("base64"),
      paused: query.paused === "true",
    });
    if (!torrent) throw new Error("Missing torrent-add result");
    return { ok: true, torrent, duplicate: torrent.duplicate === true };
  } catch {
    // Do not expose upstream URLs, credentials or other daemon details.
    throw createError({ statusCode: 503, statusMessage: "Transmission unavailable or rejected the torrent" });
  }
});
