import { existsSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Download file",
    description:
      "Stream a file from the downloads directory. " +
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
  const { path = "" } = getQuery(event);

  if (!path) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }

  const root = getDownloadsRoot();
  const filePath = resolveSafe(root, path as string);

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
