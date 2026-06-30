import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getVirtualRootEntries, resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "List directory",
    description: "List files and folders. Root shows downloads + SMB mounts.",
    parameters: [
      { name: "path", in: "query", description: "Relative path ('' = root)" },
    ],
    responses: {
      200: { description: "Directory listing" },
      400: { description: "Invalid path" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path = "" } = getQuery(event);
  const relPath = String(path || "");

  // Virtual root — list downloads + SMB mounts
  if (!relPath) {
    const entries = getVirtualRootEntries();
    const items = entries.map((e) => ({
      name: e.name,
      type: "directory" as const,
      size: 0,
      modified: new Date().toISOString(),
      isRemoteMount: e.isRemoteMount || false,
    }));
    return { path: "", items };
  }

  // Resolve to real filesystem path
  let realPath = resolveVirtualPath(relPath);
  if (!realPath) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  // If this is a mount path, ensure it's mounted
  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/$/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try {
        await ensureSmbMounted(cfg);
      } catch (err: any) {
        throw createError({
          statusCode: 500,
          statusMessage: `Cannot mount SMB share: ${err.message}`,
        });
      }
    }
  }

  try {
    const names = readdirSync(realPath);
    const items = names.map((name) => {
      const full = join(realPath, name);
      try {
        const st = statSync(full);
        return {
          name,
          type: st.isDirectory() ? ("directory" as const) : ("file" as const),
          size: st.isDirectory() ? 0 : st.size,
          modified: st.mtime.toISOString(),
          isRemoteMount: false,
        };
      } catch {
        return {
          name,
          type: "file" as const,
          size: 0,
          modified: new Date(0).toISOString(),
          isRemoteMount: false,
        };
      }
    });

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { path: relPath, items };
  } catch (err: any) {
    if (err?.statusCode) throw err;
    const code: string = err?.code ?? "";
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw createError({ statusCode: 404, statusMessage: "Folder not found" });
    }
    if (code === "EACCES" || code === "EPERM") {
      throw createError({ statusCode: 403, statusMessage: "Permission denied" });
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Cannot list directory: ${err.message}`,
    });
  }
});
