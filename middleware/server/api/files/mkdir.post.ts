import { mkdirSync, existsSync } from "node:fs";
import { resolveVirtualPath, smbMkdir } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Create folder",
    responses: { 200: {}, 400: {}, 409: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const { path } = body || {};
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });

  const resolved = resolveVirtualPath(path);
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    try { await smbMkdir(resolved.config, resolved.subPath); }
    catch (err: any) {
      throw createError({ statusCode: 500, statusMessage: `SMB: ${err.message}` });
    }
    return { ok: true };
  }

  if (existsSync(resolved.absPath))
    throw createError({ statusCode: 409, statusMessage: "Already exists" });
  try { mkdirSync(resolved.absPath, { recursive: true }); return { ok: true }; }
  catch (err: any) { throw createError({ statusCode: 500, statusMessage: err.message }); }
});
