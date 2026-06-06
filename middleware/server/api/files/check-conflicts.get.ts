/**
 * GET /api/files/check-conflicts
 *
 * Checks whether any of the source files/folders would overwrite existing
 * paths at the destination. For directories, recursively walks the source
 * to compute all target paths.
 *
 * Query: sources[] (array) + destination (string)
 * Returns: { conflicts: string[] }
 */
import { stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { resolveMountPath, getProvider, withTimeout } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Check for file conflicts before transfer",
    description: "Returns paths that would be overwritten by a move/copy operation.",
    parameters: [
      { name: "sources", in: "query", description: "Source paths (relative)" },
      { name: "destination", in: "query", description: "Destination directory (relative)" },
    ],
    responses: {
      200: { description: "List of conflicting paths" },
      400: { description: "Invalid parameters" },
    },
  },
});

/**
 * Recursively collect all file paths under a relative path.
 * Returns paths relative to the root of the source.
 */
async function collectChildPaths(relPath: string): Promise<string[]> {
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const provider = getProvider(mount);
    try {
      await provider.connect();
      return await collectRemotePaths(provider, subPath, "");
    } catch {
      return [];
    }
  }

  // Local path
  const root = getDownloadsRoot();
  const absPath = resolveSafe(root, relPath);
  try {
    const s = await stat(absPath);
    if (!s.isDirectory()) return [""]; // just the file itself
    return await collectLocalPaths(absPath, "");
  } catch {
    return [];
  }
}

async function collectLocalPaths(absDir: string, relPrefix: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const subResults = await collectLocalPaths(join(absDir, entry.name), childRel);
      results.push(...subResults);
    } else {
      results.push(childRel);
    }
  }
  return results;
}

async function collectRemotePaths(
  provider: any,
  remoteDir: string,
  relPrefix: string,
): Promise<string[]> {
  const results: string[] = [];
  let entries: any[];
  try {
    entries = await withTimeout(provider.readdir(remoteDir), 8000);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      const subResults = await collectRemotePaths(
        provider,
        join(remoteDir, entry.name).replace(/\\/g, "/"),
        childRel,
      );
      results.push(...subResults);
    } else {
      results.push(childRel);
    }
  }
  return results;
}

/**
 * Check if a given relative path exists (local or SMB).
 */
async function pathExists(relPath: string): Promise<boolean> {
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const provider = getProvider(mount);
    try {
      await provider.connect();
      await withTimeout(provider.stat(subPath), 8000);
      return true;
    } catch {
      return false;
    }
  }
  const root = getDownloadsRoot();
  try {
    const absPath = resolveSafe(root, relPath);
    return existsSync(absPath);
  } catch {
    return false;
  }
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  let sources = query.sources;
  if (!Array.isArray(sources)) {
    sources = sources ? [String(sources)] : [];
  }
  const destination = String(query.destination || "");

  if (!sources.length || !destination) {
    throw createError({
      statusCode: 400,
      statusMessage: "sources[] and destination are required",
    });
  }

  const conflicts: string[] = [];

  for (const src of sources as string[]) {
    // Compute the target path for the top-level source item
    const targetRel = join(destination, basename(src)).replace(/\\/g, "/");

    // Collect all child paths from source (recursive if directory)
    const childPaths = await collectChildPaths(src);

    // For each child, compute the equivalent target path and check existence
    for (const child of childPaths) {
      const childTarget = child
        ? join(destination, basename(src), child).replace(/\\/g, "/")
        : targetRel;

      // eslint-disable-next-line no-await-in-loop
      if (await pathExists(childTarget)) {
        conflicts.push(childTarget);
      }
    }
  }

  return { conflicts };
});
