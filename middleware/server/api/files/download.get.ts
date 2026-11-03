import { existsSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
import { resolveVirtualPath, smbDownloadStream } from "../../utils/remoteMounts";
import {
  attachmentDisposition,
  getMimeType,
  parseRange,
  sendDownloadStream,
} from "../../utils/file-stream";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Download file (supports Range requests for audio seeking)",
    parameters: [
      { name: "path", in: "query", required: true },
      { name: "token", in: "query" },
      { name: "download", in: "query", description: "1 forces an attachment, including audio" },
    ],
    responses: { 200: {}, 206: {}, 416: {}, 404: {} },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { path = "", download } = getQuery(event);
  const forceDownload = download === "1";
  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "X-Content-Type-Options", "nosniff");
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });

  const relPath = String(path);
  const resolved = resolveVirtualPath(relPath);
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    // SMB: full download only (smbclient "get" lacks offset/range support)
    const { stream, fileSize, destroy } = smbDownloadStream(resolved.config, resolved.subPath);
    const filename = basename(relPath.replace(/\\/g, "/"));
    const mimeType = forceDownload ? "application/octet-stream" : getMimeType(filename);
    setHeader(event, "Content-Type", mimeType);
    if (mimeType === "application/octet-stream") {
      setHeader(event, "Content-Disposition", attachmentDisposition(filename));
    }
    if (fileSize) setHeader(event, "Content-Length", String(fileSize));
    return sendDownloadStream(event, stream, destroy);
  }

  // Local file
  if (!existsSync(resolved.absPath))
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  const st = statSync(resolved.absPath);
  if (st.isDirectory())
    throw createError({ statusCode: 400, statusMessage: "Cannot download a directory" });

  const filename = basename(resolved.absPath);
  const mimeType = forceDownload ? "application/octet-stream" : getMimeType(filename);
  const isAudio = mimeType !== "application/octet-stream";

  // Always advertise range support for local files
  setHeader(event, "Accept-Ranges", "bytes");
  setHeader(event, "Content-Type", mimeType);

  // Handle HTTP Range requests (required for audio seeking in Webamp)
  const rangeHeader = getHeader(event, "Range");
  if (rangeHeader && st.size > 0) {
    const range = parseRange(rangeHeader, st.size);
    if (range) {
      const length = range.end - range.start + 1;
      setHeader(event, "Content-Range", `bytes ${range.start}-${range.end}/${st.size}`);
      setHeader(event, "Content-Length", String(length));
      if (!isAudio) {
        setHeader(event, "Content-Disposition", attachmentDisposition(filename));
      }
      setResponseStatus(event, 206);
      return sendDownloadStream(
        event,
        createReadStream(resolved.absPath, { start: range.start, end: range.end }),
      );
    }
    // Invalid range → 416 Range Not Satisfiable
    setHeader(event, "Content-Range", `bytes */${st.size}`);
    throw createError({ statusCode: 416, statusMessage: "Range Not Satisfiable" });
  }

  // Full file (no Range header)
  if (!isAudio) {
    setHeader(event, "Content-Disposition", attachmentDisposition(filename));
  }
  setHeader(event, "Content-Length", String(st.size));
  return sendDownloadStream(event, createReadStream(resolved.absPath));
});
