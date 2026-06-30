import { existsSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Download file",
    description:
      "Stream a file from the downloads directory or a mounted SMB share. " +
      "Accepts Bearer token via Authorization header OR via `?token=` query parameter.",
    parameters: [
      { name: "path", in: "query", required: true, description: "Relative file path" },
      { name: "token", in: "query", description: "JWT token (alternative to Authorization header)" },
    ],
    responses: {
      200: { description: "File stream" },
      400: { description: "Missing path or path is a directory" },
      404: { description: "File not found" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path = "" } = getQuery(event);
  if (!path) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }

  const relPath = String(path);

  // Resolve to real filesystem path
  const realPath = resolveVirtualPath(relPath);
  if (!realPath) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  // If inside a mount, ensure it's mounted
  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try { await ensureSmbMounted(cfg); } catch (err: any) {
        throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
      }
    }
  }

  if (!existsSync(realPath)) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }

  const st = statSync(realPath);
  if (st.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: "Cannot download a directory" });
  }

  const filename = basename(realPath);
  setHeader(event, "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  setHeader(event, "Content-Type", "application/octet-stream");
  setHeader(event, "Content-Length", String(st.size));

  return sendStream(event, createReadStream(realPath));
});
