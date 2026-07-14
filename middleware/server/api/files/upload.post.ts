import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import { resolveVirtualPath, smbUploadStream, getDownloadsRoot } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"], summary: "Upload files",
    responses: { 200: {}, 400: {}, 503: {} },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  try {
    const req = event.node.req;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
    }

    const bb = busboy({ headers });

    let dirField = "";
    const pending: Promise<void>[] = [];
    const uploaded: string[] = [];
    const errors: Array<{ name: string; message: string }> = [];

    bb.on("field", (name, val) => {
      if (name === "dir") dirField = val;
    });

    bb.on("file", (name, stream, info) => {
      const { filename } = info;
      const safeName = filename.replace(/[/\\]/g, "_");

      const resolved = dirField ? resolveVirtualPath(dirField) : null;
      const root = getDownloadsRoot();

      const promise = (async () => {
        try {
          if (resolved?.type === "smb") {
            const subPath = resolved.subPath
              ? `${resolved.subPath}/${safeName}`
              : safeName;
            await smbUploadStream(resolved.config, subPath, stream);
          } else {
            const targetDir = resolved ? resolved.absPath : root;
            if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
            const dest = join(targetDir, safeName);
            await pipeline(stream, createWriteStream(dest));
          }
          uploaded.push(safeName);
        } catch (err: any) {
          errors.push({ name: safeName, message: err.message });
        }
      })();
      pending.push(promise);
    });

    return new Promise((resolve, reject) => {
      bb.on("close", async () => {
        try {
          await Promise.all(pending);
          if (uploaded.length === 0 && errors.length > 0) {
            const msgs = errors.map((e) => `${e.name}: ${e.message}`).join("; ");
            throw createError({ statusCode: 500, statusMessage: msgs });
          }
          resolve({ ok: true, uploaded, errors: errors.map((e) => `${e.name}: ${e.message}`) });
        } catch (err) {
          reject(err);
        }
      });
      bb.on("error", reject);
      req.pipe(bb);
    });
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || "Upload failed",
    });
  }
});
