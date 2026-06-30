import { renameSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";
import { getDownloadsRoot } from "../../utils/files";
defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Rename file or folder",
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
  requireUser(event);

  const body = await readBody(event);
  const { path, name } = body || {};

  if (!path || !name) {
    throw createError({ statusCode: 400, statusMessage: "path and name are required" });
  }

  if (/[/\\\\]/.test(String(name))) {
    throw createError({ statusCode: 400, statusMessage: "name must not contain path separators" });
  }

  const realPath = resolveVirtualPath(path);
  if (!realPath) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  // Ensure mount if needed
  const clean = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try { await ensureSmbMounted(cfg); } catch (err: any) {
        throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
      }
    }
  }

  const fromPath = realPath;
  const toPath = join(dirname(fromPath), String(name));

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
