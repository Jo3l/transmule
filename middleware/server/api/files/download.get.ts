import { existsSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
import { getProvider, resolveMountPath, withTimeout, buildRemotePath } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Download file",
    description:
      "Stream a file from the downloads directory or a remote mount. " +
      "Accepts Bearer token via Authorization header OR via `?token=` query " +
      "parameter (required for browser anchor downloads).",
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

  // Check if we are inside a remote mount
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const provider = getProvider(mount);

    try {
      await provider.connect();
      const remoteFilePath = buildRemotePath(mount, subPath);

      const readable = await withTimeout(provider.createReadStream(subPath), 8000);
      const filename = remoteFilePath.includes(mount.type === "webdav" ? "/" : "\\")
        ? remoteFilePath.slice(remoteFilePath.lastIndexOf(mount.type === "webdav" ? "/" : "\\") + 1)
        : remoteFilePath;

      setHeader(
        event,
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      setHeader(event, "Content-Type", "application/octet-stream");
      
      // Get file size
      const stats = await withTimeout(provider.stat(subPath), 8000);
      if (stats.size) {
        setHeader(event, "Content-Length", String(stats.size));
      }

      // Disconnect after stream finishes
      readable.on("end", () => {
        provider.disconnect().catch(() => {});
      });
      readable.on("error", () => {
        provider.disconnect().catch(() => {});
      });

      return sendStream(event, readable);
    } catch (err: any) {
      console.error(`[download] Error downloading remote file: ${relPath}`, err);
      provider.disconnect().catch(() => {});
      throw createError({
        statusCode: 404,
        statusMessage: `File not found on remote share: ${err.message}`,
      });
    }
  }

  const root = getDownloadsRoot();
  const filePath = resolveSafe(root, relPath);

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }

  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: "Cannot download a directory" });
  }

  const filename = basename(filePath);
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  setHeader(event, "Content-Type", "application/octet-stream");
  setHeader(event, "Content-Length", String(stat.size));

  return sendStream(event, createReadStream(filePath));
});
