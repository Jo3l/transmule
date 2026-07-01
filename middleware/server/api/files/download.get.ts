import { existsSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
import { resolveVirtualPath, smbDownloadStream } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Download file (supports Range requests for audio seeking)",
    parameters: [
      { name: "path", in: "query", required: true },
      { name: "token", in: "query" },
    ],
    responses: { 200: {}, 206: {}, 416: {}, 404: {} },
  },
});

/** MIME types for common audio formats (enables proper Content-Type for streaming). */
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    m4a: "audio/mp4",
  };
  return mimes[ext] || "application/octet-stream";
}

/**
 * Parse an HTTP Range header value.
 * Handles: bytes=START-, bytes=START-END, bytes=-SUFFIX
 */
function parseRange(
  header: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const rawStart = match[1];
  const rawEnd = match[2];

  let start: number;
  let end: number;

  if (rawStart === "" && rawEnd !== "") {
    // Suffix range: bytes=-500 → last 500 bytes
    const suffix = parseInt(rawEnd, 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else {
    start = rawStart ? parseInt(rawStart, 10) : 0;
    end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
    if (isNaN(start) || start < 0) return null;
    if (isNaN(end) || end < 0 || end >= fileSize) end = fileSize - 1;
    if (start > end) return null;
  }

  return { start, end };
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { path = "" } = getQuery(event);
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });

  const relPath = String(path);
  const resolved = resolveVirtualPath(relPath);
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    // SMB: full download only (smbclient "get" lacks offset/range support)
    const { stream, fileSize } = smbDownloadStream(resolved.config, resolved.subPath);
    const filename = basename(relPath.replace(/\\/g, "/"));
    const mimeType = getMimeType(filename);
    setHeader(event, "Content-Type", mimeType);
    if (mimeType === "application/octet-stream") {
      setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }
    if (fileSize) setHeader(event, "Content-Length", String(fileSize));
    return sendStream(event, stream as any);
  }

  // Local file
  if (!existsSync(resolved.absPath))
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  const st = statSync(resolved.absPath);
  if (st.isDirectory())
    throw createError({ statusCode: 400, statusMessage: "Cannot download a directory" });

  const filename = basename(resolved.absPath);
  const mimeType = getMimeType(filename);
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
        setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      }
      setResponseStatus(event, 206);
      return sendStream(
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
    setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  }
  setHeader(event, "Content-Length", String(st.size));
  return sendStream(event, createReadStream(resolved.absPath));
});
