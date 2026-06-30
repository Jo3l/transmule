import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Search files recursively",
    parameters: [
      { name: "path", in: "query", description: "Relative path to start from ('' = root)" },
      { name: "q", in: "query", required: true, description: "Search query (case-insensitive)" },
    ],
    responses: { 200: { description: "Search results" }, 400: { description: "Missing query" } },
  },
});

interface SearchResultItem {
  name: string;
  relpath: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

function walkDir(dir: string, root: string, query: string, results: SearchResultItem[]): void {
  let names: string[];
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      const isDir = st.isDirectory();
      if (name.toLowerCase().includes(query)) {
        results.push({
          name,
          relpath: relative(root, dir) || "",
          type: isDir ? "directory" : "file",
          size: isDir ? 0 : st.size,
          modified: st.mtime.toISOString(),
        });
      }
      if (isDir) walkDir(full, root, query, results);
    } catch { /* skip */ }
  }
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path: relPath = "", q = "" } = getQuery(event);
  const query = String(q || "").toLowerCase().trim();
  if (!query) throw createError({ statusCode: 400, statusMessage: "Search query is required" });

  const realPath = resolveVirtualPath(String(relPath));
  if (!realPath) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  // Ensure mount if needed
  const clean = String(relPath).replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try { await ensureSmbMounted(cfg); } catch (err: any) {
        throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
      }
    }
  }

  const results: SearchResultItem[] = [];
  walkDir(realPath, realPath, query, results);

  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { query, path: relPath, results };
});
