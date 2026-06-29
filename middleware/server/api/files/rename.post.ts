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
  requireUser(event);

  const body = await readBody(event);
  const { path, name } = body || {};

  if (!path || !name) {
    throw createError({ statusCode: 400, statusMessage: "path and name are required" });
  }

  // Reject slash / backslash in the new name to prevent directory traversal
  if (/[/\\\\]/.test(String(name))) {
    throw createError({ statusCode: 400, statusMessage: "name must not contain path separators" });
  }

  // Check if we are inside a remote mount
  const mountInfo = resolveMountPath(path);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const client = createSmbClient(mount);

    try {
      // Build the sibling path (same parent, new name) using raw subPath segments
      const segs = subPath.split(/[\\\\/]/);
      const parent = segs.slice(0, -1);
      const toSubPath = [...parent, String(name)].join("\\");

      // Check source exists via stat (catch ENOENT)
      try {
        await withTimeout(client.stat(subPath), 8000);
      } catch {
        throw createError({ statusCode: 404, statusMessage: "Source not found" });
      }

      // Check destination does not exist via stat
      try {
        await withTimeout(client.stat(toSubPath), 8000);
        throw createError({ statusCode: 409, statusMessage: "Destination already exists" });
      } catch (err: any) {
        if (err?.statusCode) throw err;
        // stat threw because path doesn't exist — that's what we want
      }

      // Pass raw subPaths — the provider's rename() builds the full remote path via getRemotePath()
      await withTimeout(client.rename(subPath, toSubPath), 8000);
      return { ok: true, name: String(name) };
    } catch (err: any) {
      if (err?.statusCode) throw err;
      throw createError({
        statusCode: 500,
        statusMessage: `Cannot rename on remote share: ${err.message}`,
      });
    } finally {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  const root = getDownloadsRoot();
  const fromPathLocal = resolveSafe(root, path);
  const toPathLocal = join(dirname(fromPathLocal), String(name));

  // Validate destination is also within root
  resolveSafe(root, toPathLocal.slice(root.length).replace(/^[/\\\\]/, ""));

  if (!existsSync(fromPathLocal)) {
    throw createError({ statusCode: 404, statusMessage: "Source not found" });
  }
  if (existsSync(toPathLocal)) {
    throw createError({ statusCode: 409, statusMessage: "Destination already exists" });
  }

  try {
    renameSync(fromPathLocal, toPathLocal);
    return { ok: true, name: basename(toPathLocal) };
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message });
  }
});
