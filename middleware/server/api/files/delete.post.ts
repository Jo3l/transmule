import { rmSync, existsSync } from "node:fs";
import { resolveVirtualPath, smbRmRecursive, smbRm, smbStat, getDownloadsRoot } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Delete files or folders",
    responses: { 200: {}, 400: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const rawPaths: string[] = Array.isArray(body?.paths) ? body.paths
    : body?.path ? [body.path] : [];
  if (!rawPaths.length) throw createError({ statusCode: 400, statusMessage: "paths is required" });

  const root = getDownloadsRoot();
  const errors: string[] = [];

  for (const rel of rawPaths) {
    try {
      const resolved = resolveVirtualPath(rel);
      if (!resolved) { errors.push(`${rel}: invalid path`); continue; }

      if (resolved.type === "smb") {
        const st = await smbStat(resolved.config, resolved.subPath);
        if (!st) { errors.push(`${rel}: not found`); continue; }
        if (st.type === "directory") await smbRmRecursive(resolved.config, resolved.subPath);
        else await smbRm(resolved.config, resolved.subPath);
        continue;
      }

      if (resolved.absPath === root) { errors.push(`${rel}: cannot delete root`); continue; }
      if (!existsSync(resolved.absPath)) { errors.push(`${rel}: not found`); continue; }
      rmSync(resolved.absPath, { recursive: true, force: true });
    } catch (err: any) {
      errors.push(`${rel}: ${err.message}`);
    }
  }
  if (errors.length === rawPaths.length)
    throw createError({ statusCode: 500, statusMessage: errors.join("; ") });
  return { ok: true, errors };
});
