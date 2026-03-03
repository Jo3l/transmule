import { renameSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Rename file or folder",
    description: "Rename a file or folder within the same directory.",
    responses: {
      200: { description: "Renamed" },
      400: { description: "Missing or invalid parameters" },
      404: { description: "Source not found" },
      409: { description: "Destination already exists" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { path, name } = body || {};

  if (!path || !name) {
    throw createError({ statusCode: 400, statusMessage: "path and name are required" });
  }

  // Reject slash / backslash in the new name to prevent directory traversal
  if (/[/\\]/.test(String(name))) {
    throw createError({ statusCode: 400, statusMessage: "name must not contain path separators" });
  }

  const root = getDownloadsRoot();
  const fromPath = resolveSafe(root, path);
  const toPath = join(dirname(fromPath), String(name));

  // Validate destination is also within root
  resolveSafe(root, toPath.slice(root.length).replace(/^[/\\]/, ""));

  if (!existsSync(fromPath)) {
    throw createError({ statusCode: 404, statusMessage: "Source not found" });
  }
  if (existsSync(toPath)) {
    throw createError({ statusCode: 409, statusMessage: "Destination already exists" });
  }

  try {
    renameSync(fromPath, toPath);
    return { ok: true, name: basename(toPath) };
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message });
  }
});
