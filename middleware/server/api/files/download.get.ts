import { existsSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
import { resolveVirtualPath, smbDownloadStream } from "../../utils/remoteMounts";
import { Readable } from "node:stream";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"], summary: "Download file",
    parameters: [
      { name: "path", in: "query", required: true },
      { name: "token", in: "query" },
    ],
    responses: { 200: {}, 404: {} },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { path = "" } = getQuery(event);
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });

  const relPath = String(path);
  const resolved = resolveVirtualPath(relPath);
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    const { stream, fileSize } = smbDownloadStream(resolved.config, resolved.subPath);
    const filename = basename(relPath.replace(/\\/g, "/"));
    setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    setHeader(event, "Content-Type", "application/octet-stream");
    if (fileSize) setHeader(event, "Content-Length", String(fileSize));
    return sendStream(event, stream as any);
  }

  // Local
  if (!existsSync(resolved.absPath))
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  const st = statSync(resolved.absPath);
  if (st.isDirectory())
    throw createError({ statusCode: 400, statusMessage: "Cannot download a directory" });
  const filename = basename(resolved.absPath);
  setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  setHeader(event, "Content-Type", "application/octet-stream");
  setHeader(event, "Content-Length", String(st.size));
  return sendStream(event, createReadStream(resolved.absPath));
});
