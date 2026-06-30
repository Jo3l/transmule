import { renameSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { resolveVirtualPath, smbRename } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Rename file or folder",
    responses: { 200: {}, 400: {}, 404: {}, 409: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const { path, name } = body || {};
  if (!path || !name) throw createError({ statusCode: 400, statusMessage: "path and name are required" });
  if (/[/\\\\]/.test(String(name)))
    throw createError({ statusCode: 400, statusMessage: "name must not contain path separators" });

  const resolved = resolveVirtualPath(path);
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    const segs = resolved.subPath.replace(/\\/g, "/").split("/");
    const parent = segs.slice(0, -1).join("/");
    const newSub = parent ? `${parent}/${name}` : name;
    try {
      await smbRename(resolved.config, resolved.subPath, newSub);
      return { ok: true, name };
    } catch (err: any) {
      throw createError({ statusCode: 500, statusMessage: `SMB: ${err.message}` });
    }
  }

  const from = resolved.absPath;
  const to = join(dirname(from), String(name));
  if (!existsSync(from)) throw createError({ statusCode: 404, statusMessage: "Source not found" });
  if (existsSync(to)) throw createError({ statusCode: 409, statusMessage: "Destination already exists" });
  try { renameSync(from, to); return { ok: true, name: basename(to) }; }
  catch (err: any) { throw createError({ statusCode: 500, statusMessage: err.message }); }
});
