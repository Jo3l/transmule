import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  getVirtualRootEntries, resolveVirtualPath, smbListDir,
} from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"], summary: "List directory",
    parameters: [{ name: "path", in: "query", description: "Relative path ('' = root)" }],
    responses: { 200: { description: "Directory listing" }, 500: { description: "Error" } },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { path = "" } = getQuery(event);
  const relPath = String(path || "");

  // Virtual root
  if (!relPath) {
    const entries = getVirtualRootEntries();
    return {
      path: "",
      items: entries.map((e) => ({
        name: e.name, type: "directory" as const,
        size: 0, modified: new Date().toISOString(),
        isRemoteMount: e.isRemoteMount || false,
      })),
    };
  }

  const resolved = resolveVirtualPath(relPath);
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    try {
      const entries = await smbListDir(resolved.config, resolved.subPath);
      const items = entries.map((e) => ({
        name: e.name, type: e.type, size: e.size, modified: e.modified,
        isRemoteMount: false,
      }));
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return { path: relPath, items };
    } catch (err: any) {
      throw createError({ statusCode: 500, statusMessage: `SMB: ${err.message}` });
    }
  }

  // Local
  try {
    const names = readdirSync(resolved.absPath);
    const items = names.map((name) => {
      const full = join(resolved.absPath, name);
      try {
        const st = statSync(full);
        return {
          name, type: st.isDirectory() ? ("directory" as const) : ("file" as const),
          size: st.isDirectory() ? 0 : st.size,
          modified: st.mtime.toISOString(), isRemoteMount: false,
        };
      } catch {
        return { name, type: "file" as const, size: 0,
          modified: new Date(0).toISOString(), isRemoteMount: false };
      }
    });
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { path: relPath, items };
  } catch (err: any) {
    if (err?.statusCode) throw err;
    const code = err?.code ?? "";
    if (code === "ENOENT" || code === "ENOTDIR")
      throw createError({ statusCode: 404, statusMessage: "Folder not found" });
    if (code === "EACCES" || code === "EPERM")
      throw createError({ statusCode: 403, statusMessage: "Permission denied" });
    throw createError({ statusCode: 500, statusMessage: err.message });
  }
});
