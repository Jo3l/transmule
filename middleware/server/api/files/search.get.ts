import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getProvider, resolveMountPath, withTimeout } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Search files recursively",
    description: "Recursively search for files whose name contains the query string, starting from the given path.",
    parameters: [
      {
        name: "path",
        in: "query",
        description: "Relative path inside downloads root to start searching from ('' = root)",
      },
      {
        name: "q",
        in: "query",
        required: true,
        description: "Search query string (case-insensitive match on filename)",
      },
    ],
    responses: {
      200: { description: "Search results" },
      400: { description: "Missing query" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

interface SearchResultItem {
  name: string;
  /** Relative path from the search root to this item's parent directory */
  relpath: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

function walkDir(dir: string, root: string, query: string, results: SearchResultItem[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      const isDir = st.isDirectory();
      const lower = name.toLowerCase();
      if (lower.includes(query)) {
        results.push({
          name,
          relpath: relative(root, dir) || "",
          type: isDir ? ("directory" as const) : ("file" as const),
          size: isDir ? 0 : st.size,
          modified: st.mtime.toISOString(),
        });
      }
      if (isDir) {
        walkDir(full, root, query, results);
      }
    } catch {
      // skip inaccessible files/dirs
    }
  }
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path: relPath = "", q = "" } = getQuery(event);
  const query = String(q || "").toLowerCase().trim();
  if (!query) {
    throw createError({ statusCode: 400, statusMessage: "Search query is required" });
  }

  // Check if we are inside a remote mount
  const mountInfo = resolveMountPath(String(relPath));
  if (mountInfo) {
    // Remote mounts don't support recursive search — return empty
    return { query, path: relPath, results: [] as SearchResultItem[] };
  }

  const root = getDownloadsRoot();
  const dir = resolveSafe(root, String(relPath));
  const results: SearchResultItem[] = [];

  walkDir(dir, dir, query, results);

  // Sort: directories first, then alphabetically
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { query, path: relPath, results };
});
