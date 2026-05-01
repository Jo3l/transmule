import { rmSync, existsSync } from "node:fs";
import { getProvider, resolveMountPath, isMountRoot } from "../../utils/remoteMounts";
import { getDownloadsRoot, resolveSafe } from "../../utils/files";

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
      // Prevent deleting remote mounts directly
      if (isMountRoot(rel)) {
        errors.push(`${rel}: cannot delete a remote mount directly — use unmount instead`);
        continue;
      }

      // If path is inside a remote mount, use provider delete
      const mountInfo = resolveMountPath(rel);
      if (mountInfo) {
        const { mount, subPath } = mountInfo;
        const provider = getProvider(mount);
        try {
          await provider.connect();
          await deleteRecursive(provider, subPath);
        } catch (err: any) {
          errors.push(`${rel}: ${err.message}`);
        } finally {
          try {
            await provider.disconnect();
          } catch {
            /* ignore */
          }
        }
        continue;
      }

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

/**
 * Recursively delete a path using the provider
 */
async function deleteRecursive(provider: any, path: string): Promise<void> {
  const stats = await provider.stat(path).catch(() => null);
  if (!stats) return;
  
  if (stats.isDirectory === true) {
    const children = await provider.readdir(path).catch(() => []);
    for (const child of children) {
      const childPath = path ? `${path}/${child.name}` : child.name;
      await deleteRecursive(provider, childPath);
    }
    await provider.rmdir(path);
  } else {
    await provider.unlink(path);
  }
}
