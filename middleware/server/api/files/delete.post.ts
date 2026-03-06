import { rmSync, existsSync } from "node:fs";

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
  // Accept single path or array of paths
  const rawPaths: string[] = Array.isArray(body?.paths)
    ? body.paths
    : body?.path
      ? [body.path]
      : [];

  if (!rawPaths.length) {
    throw createError({ statusCode: 400, statusMessage: "paths is required" });
  }

  const root = getDownloadsRoot();

  const errors: string[] = [];
  for (const rel of rawPaths) {
    try {
      const target = resolveSafe(root, rel);
      // Prevent deleting the root itself
      if (target === root) {
        errors.push(`${rel}: cannot delete root`);
        continue;
      }
      if (!existsSync(target)) {
        errors.push(`${rel}: not found`);
        continue;
      }
      rmSync(target, { recursive: true, force: true });
    } catch (err: any) {
      errors.push(`${rel}: ${err.message}`);
    }
  }

  if (errors.length === rawPaths.length) {
    throw createError({ statusCode: 500, statusMessage: errors.join("; ") });
  }

  return { ok: true, errors };
});
