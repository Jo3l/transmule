import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getProvider, resolveMountPath, withTimeout } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "List directory",
    description: "List files and folders inside the downloads directory.",
    parameters: [
      {
        name: "path",
        in: "query",
        description: "Relative path inside downloads root ('' = root)",
      },
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

  // Check if we are inside a remote mount
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const provider = getProvider(mount);

    try {
      await provider.connect();
      const files = await withTimeout(provider.readdir(subPath), 8000);

      const items = files.map((f) => ({
        name: f.name,
        type: f.isDirectory ? ("directory" as const) : ("file" as const),
        size: f.size ?? 0,
        modified: f.modified ? f.modified.toISOString() : new Date().toISOString(),
        isRemoteMount: false,
      }));

      // Directories first, then alphabetically by name
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { path: relPath, items };
    } catch (err: any) {
      throw createError({
        statusCode: 500,
        statusMessage: `Cannot list remote directory: ${err.message}`,
      });
    }
  }

  const root = getDownloadsRoot();
  const dir = resolveSafe(root, relPath);

  try {
    const names = readdirSync(dir);
    const items = names.map((name) => {
      const full = join(dir, name);
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

    // At root, inject remote mounts as directories
    if (!relPath) {
      for (const mount of loadMounts()) {
        items.push({
          name: mount.name,
          type: "directory" as const,
          size: 0,
          modified: new Date().toISOString(),
          isRemoteMount: true,
        });
      }
    }

    // Directories first, then alphabetically by name
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
      throw createError({
        statusCode: 403,
        statusMessage: "Permission denied",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Cannot list directory: ${err.message}`,
    });
  }
});
