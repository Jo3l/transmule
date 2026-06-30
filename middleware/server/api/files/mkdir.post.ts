import { mkdirSync, existsSync } from "node:fs";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create folder",
    responses: {
      200: { description: "Folder created" },
      400: { description: "Missing path" },
      409: { description: "Already exists" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { path } = body || {};

  if (!path) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }

  const realPath = resolveVirtualPath(path);
  if (!realPath) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  const clean = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try { await ensureSmbMounted(cfg); } catch (err: any) {
        throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
      }
    }
  }

  if (existsSync(realPath)) {
    throw createError({ statusCode: 409, statusMessage: "Already exists" });
  }

  try {
    mkdirSync(realPath, { recursive: true });
    return { ok: true };
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message });
  }
});
