defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Download directory",
    description:
      "Download an entire directory from a remote user. The middleware recursively collects all files from cached browse data and chunks them into slskd batch downloads. Much lighter than sending the full file list from the frontend.",
    responses: {
      200: { description: "Download queued" },
      400: { description: "Missing parameters" },
      404: { description: "Directory not found in browse cache" },
      502: { description: "slskd error" },
    },
  },
});

import { getBrowseCache, setBrowseCache } from "../../utils/browseCache";

const CHUNK_SIZE = 500; // files per slskd batch request

export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const body = await readBody(event);

  const username: string = body.username;
  const directoryPath: string = body.directoryPath;

  if (!username || !directoryPath) {
    throw createError({
      statusCode: 400,
      statusMessage: "username and directoryPath are required",
    });
  }

  // 1. Try cached browse data first
  let browseData = getBrowseCache(username);

  // 2. Cache miss — fetch fresh from slskd
  if (!browseData) {
    try {
      const fresh = await client.browseUserFiles(username);
      if (fresh) {
        const stripFile = (f: any) => ({ filename: f.filename, size: f.size });
        browseData = {
          directories: (fresh.directories || []).map((d: any) => ({
            ...d,
            files: (d.files || []).map(stripFile),
          })),
          lockedDirectories: (fresh.lockedDirectories || []).map((d: any) => ({
            ...d,
            files: (d.files || []).map(stripFile),
            locked: true,
          })),
        };
        setBrowseCache(username, browseData);
      }
    } catch (err: any) {
      throw createError({
        statusCode: 502,
        statusMessage: `Failed to browse ${username}: ${err.message}`,
      });
    }
  }

  if (!browseData) {
    throw createError({
      statusCode: 404,
      statusMessage: `No browse data for ${username}`,
    });
  }

  // 3. Recursively find the directory and collect all files
  const allDirs = [
    ...(browseData.directories ?? []),
    ...(browseData.lockedDirectories ?? []).map((d: any) => ({ ...d, locked: true })),
  ];

  const collected = collectDirectoryFiles(allDirs, directoryPath);
  if (!collected) {
    throw createError({
      statusCode: 404,
      statusMessage: `Directory "${directoryPath}" not found in ${username}'s shares`,
    });
  }

  if (collected.length === 0) {
    return { success: true, batch: true, chunks: 0, totalFiles: 0 };
  }

  // 4. Chunk and send to slskd
  const batchId = body.batchId || crypto.randomUUID();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < collected.length; i += CHUNK_SIZE) {
    const chunk = collected.slice(i, i + CHUNK_SIZE);
    try {
      const result = await client.enqueueDownloadBatch(username, chunk, {
        batchId,
      });
      if (result.success) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
      }
    } catch {
      failed += chunk.length;
    }
  }

  return {
    success: sent > 0,
    batch: true,
    batchId,
    totalFiles: collected.length,
    sent,
    failed,
  };
});

/**
 * Recursively find a directory by its full path and collect ALL files
 * (including those in subdirectories), returning them with full remote paths.
 */
function collectDirectoryFiles(
  dirs: any[],
  targetPath: string,
): { filename: string; size: number }[] | null {
  // Build a map for quick path lookup
  const byPath = new Map<string, any>();
  for (const d of dirs) {
    byPath.set(d.name, d);
  }

  // Check if target directory exists
  if (!byPath.has(targetPath)) return null;

  // Collect target + all subdirectories (paths that start with targetPath + \)
  const prefix = targetPath + "\\";
  const matching = [targetPath];
  for (const [path] of byPath) {
    if (path !== targetPath && path.startsWith(prefix)) {
      matching.push(path);
    }
  }

  // Collect files from all matching directories
  const result: { filename: string; size: number }[] = [];
  for (const dirPath of matching) {
    const dir = byPath.get(dirPath);
    if (!dir) continue;
    for (const f of dir.files || []) {
      result.push({
        filename: dirPath + "\\" + f.filename,
        size: f.size,
      });
    }
  }

  return result;
}
