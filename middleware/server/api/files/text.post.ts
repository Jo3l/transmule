import { existsSync, writeFileSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { resolveVirtualPath, smbUploadStream } from "../../utils/remoteMounts";

const MAX_SIZE = 1024 * 1024;

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Write text file",
    responses: { 200: {}, 400: {}, 404: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody<{ path: string; content: string }>(event);
  const { path = "", content = "" } = body ?? {};
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });
  if (typeof content !== "string") throw createError({ statusCode: 400, statusMessage: "content must be a string" });
  if (Buffer.byteLength(content, "utf8") > MAX_SIZE)
    throw createError({ statusCode: 400, statusMessage: "Content too large (>1 MB)" });

  const resolved = resolveVirtualPath(String(path));
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    await smbUploadStream(resolved.config, resolved.subPath, Readable.from([Buffer.from(content, "utf8")]));
    return { ok: true };
  }

  if (!existsSync(resolved.absPath)) throw createError({ statusCode: 404, statusMessage: "File not found" });
  const st = statSync(resolved.absPath);
  if (st.isDirectory()) throw createError({ statusCode: 400, statusMessage: "Path is a directory" });
  writeFileSync(resolved.absPath, content, "utf8");
  return { ok: true };
});
