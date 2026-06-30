import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { resolveVirtualPath, smbUploadStream, getDownloadsRoot } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"], summary: "Upload files",
    responses: { 200: {}, 400: {}, 503: {} },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const form = await readMultipartFormData(event);
  if (!form || form.length === 0)
    throw createError({ statusCode: 400, statusMessage: "No multipart data" });

  const dirField = form.find((f) => f.name === "dir");
  const relDir = dirField?.data?.toString() || "";

  const resolved = relDir ? resolveVirtualPath(relDir) : null;
  const root = getDownloadsRoot();

  // Ensure local target dir exists
  if (!resolved) {
    const target = root;
    if (!existsSync(target)) mkdirSync(target, { recursive: true });
  } else if (resolved.type === "local" && !existsSync(resolved.absPath)) {
    mkdirSync(resolved.absPath, { recursive: true });
  }

  const uploaded: string[] = [];
  const errors: string[] = [];

  for (const field of form) {
    if (!field.filename || !field.data) continue;
    const safeName = field.filename.replace(/[/\\\\]/g, "_");

    try {
      if (resolved && resolved.type === "smb") {
        const subPath = resolved.subPath
          ? `${resolved.subPath}/${safeName}`
          : safeName;
        await smbUploadStream(resolved.config, subPath, Readable.from([field.data]));
      } else {
        const targetDir = resolved ? resolved.absPath : root;
        const dest = join(targetDir, safeName);
        writeFileSync(dest, field.data);
      }
      uploaded.push(safeName);
    } catch (err: any) {
      errors.push(`${field.filename}: ${err.message}`);
    }
  }

  if (uploaded.length === 0 && errors.length > 0)
    throw createError({ statusCode: 500, statusMessage: errors.join("; ") });
  return { ok: true, uploaded, errors };
});
