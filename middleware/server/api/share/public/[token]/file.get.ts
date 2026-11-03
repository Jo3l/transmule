import { createReadStream, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { resolveVirtualPath, smbDownloadStream } from "../../../../utils/remoteMounts";
import {
  attachmentDisposition, getMimeType, parseRange, sendDownloadStream,
} from "../../../../utils/file-stream";
import { loadShareByRef, requireShareTicket } from "../../../../utils/share-access";
import { isInsideAnyRoot, normalizeVirtualPath } from "../../../../utils/share-paths";
import { incrementDownloads } from "../../../../utils/share-db";

defineRouteMeta({
  openAPI: {
    tags: ["Shares (public)"],
    summary: "Download a file from a share (Range supported for local files)",
    parameters: [
      { name: "token", in: "path", required: true },
      { name: "path", in: "query", required: true, description: "Virtual path inside the share" },
      { name: "t", in: "query", required: true, description: "Ticket from /unlock" },
    ],
    responses: {
      200: { description: "File contents" },
      206: { description: "Partial content" },
      403: { description: "Outside the share or missing ticket" },
      404: { description: "File not found" },
      410: { description: "Expired or revoked" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ref = decodeURIComponent(getRouterParam(event, "token") ?? "");
  const share = loadShareByRef(ref);
  requireShareTicket(event, share);

  const { path = "" } = getQuery(event);
  const normalized = normalizeVirtualPath(typeof path === "string" ? path : "");
  if (!normalized) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }
  if (!isInsideAnyRoot(share.roots, normalized)) {
    throw createError({ statusCode: 403, statusMessage: "Path outside the share" });
  }

  const resolved = resolveVirtualPath(normalized);
  if (!resolved) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "X-Content-Type-Options", "nosniff");

  if (resolved.type === "smb") {
    // smbclient "get" has no offset support: full file only.
    const { stream, fileSize, destroy } = smbDownloadStream(resolved.config, resolved.subPath);
    const filename = basename(normalized);
    setHeader(event, "Content-Type", getMimeType(filename));
    setHeader(event, "Content-Disposition", attachmentDisposition(filename));
    if (fileSize) setHeader(event, "Content-Length", fileSize);
    incrementDownloads(share.id);
    return sendDownloadStream(event, stream, destroy);
  }

  if (!existsSync(resolved.absPath)) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }
  const st = statSync(resolved.absPath);
  if (st.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: "Cannot download a directory" });
  }

  const filename = basename(resolved.absPath);
  setHeader(event, "Accept-Ranges", "bytes");
  setHeader(event, "Content-Type", getMimeType(filename));
  setHeader(event, "Content-Disposition", attachmentDisposition(filename));

  const rangeHeader = getHeader(event, "Range");
  if (rangeHeader && st.size > 0) {
    const range = parseRange(rangeHeader, st.size);
    if (range) {
      const length = range.end - range.start + 1;
      setHeader(event, "Content-Range", `bytes ${range.start}-${range.end}/${st.size}`);
      setHeader(event, "Content-Length", length);
      setResponseStatus(event, 206);
      return sendDownloadStream(
        event,
        createReadStream(resolved.absPath, { start: range.start, end: range.end }),
      );
    }
    setHeader(event, "Content-Range", `bytes */${st.size}`);
    throw createError({ statusCode: 416, statusMessage: "Range Not Satisfiable" });
  }

  setHeader(event, "Content-Length", st.size);
  incrementDownloads(share.id);
  return sendDownloadStream(event, createReadStream(resolved.absPath));
});
