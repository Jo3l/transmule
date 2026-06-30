import { rmSync, existsSync } from "node:fs";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";
import { getDownloadsRoot } from "../../utils/files";
defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Delete files or folders",
    description: "Delete one or more files / folders (recursively).",
    responses: {
      200: { description: "Deleted" },
      400: { description: "Missing or invalid paths" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const rawPaths: string[] = Array.isArray(body?.paths)
    ? body.paths
    : body?.path ? [body.path] : [];

  if (!rawPaths.length) {
    throw createError({ statusCode: 400, statusMessage: "paths is required" });
  }

  const root = getDownloadsRoot();
  const errors: string[] = [];

  for (const rel of rawPaths) {
    try {
      const realPath = resolveVirtualPath(rel);
      if (!realPath) {
        errors.push(`${rel}: invalid path`);
        continue;
      }

      // Ensure mount if needed
      const clean = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");
      const firstSeg = clean.split("/")[0];
      if (firstSeg !== "downloads") {
        const cfg = getSmbConfigByName(firstSeg);
        if (cfg) {
          try { await ensureSmbMounted(cfg); } catch (err: any) {
            errors.push(`${rel}: mount failed - ${err.message}`);
            continue;
          }
        }
      }

      if (realPath === root) {
        errors.push(`${rel}: cannot delete root`);
        continue;
      }
      if (!existsSync(realPath)) {
        errors.push(`${rel}: not found`);
        continue;
      }
      rmSync(realPath, { recursive: true, force: true });
    } catch (err: any) {
      errors.push(`${rel}: ${err.message}`);
    }
  }

  if (errors.length === rawPaths.length) {
    throw createError({ statusCode: 500, statusMessage: errors.join("; ") });
  }

  return { ok: true, errors };
});
