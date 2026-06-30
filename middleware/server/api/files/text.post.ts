import { existsSync, writeFileSync, statSync } from "node:fs";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

const MAX_SIZE = 1024 * 1024;

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Write text file",
    description: "Overwrites a text file with UTF-8 content.",
    responses: {
      200: { description: "{ ok: true }" },
      400: { description: "Validation error" },
      404: { description: "File not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody<{ path: string; content: string }>(event);
  const { path = "", content = "" } = body ?? {};

  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });
  if (typeof content !== "string") throw createError({ statusCode: 400, statusMessage: "content must be a string" });

  const byteLen = Buffer.byteLength(content, "utf8");
  if (byteLen > MAX_SIZE) throw createError({ statusCode: 400, statusMessage: "Content too large (>1 MB)" });

  const relPath = String(path);
  const realPath = resolveVirtualPath(relPath);
  if (!realPath) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try { await ensureSmbMounted(cfg); } catch (err: any) {
        throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
      }
    }
  }

  if (!existsSync(realPath)) throw createError({ statusCode: 404, statusMessage: "File not found" });

  const st = statSync(realPath);
  if (st.isDirectory()) throw createError({ statusCode: 400, statusMessage: "Path is a directory" });

  writeFileSync(realPath, content, "utf8");
  return { ok: true };
});
