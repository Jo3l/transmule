import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveVirtualPath, smbListDir } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Search files recursively",
    parameters: [
      { name: "path", in: "query" },
      { name: "q", in: "query", required: true },
    ],
    responses: { 200: {}, 400: {} } },
});

interface SR { name: string; relpath: string; type: "file" | "directory"; size: number; modified: string; }

function walkDir(dir: string, root: string, query: string, results: SR[]): void {
  let names: string[];
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      const isDir = st.isDirectory();
      if (name.toLowerCase().includes(query)) {
        results.push({ name, relpath: relative(root, dir) || "",
          type: isDir ? "directory" : "file", size: isDir ? 0 : st.size,
          modified: st.mtime.toISOString() });
      }
      if (isDir) walkDir(full, root, query, results);
    } catch { /* skip */ }
  }
}

async function walkSmb(
  config: any, dirPath: string, basePath: string, query: string, results: SR[],
): Promise<void> {
  let entries;
  try { entries = await smbListDir(config, dirPath); } catch { return; }
  for (const e of entries) {
    if (e.name.toLowerCase().includes(query)) {
      results.push({ name: e.name, relpath: dirPath || "",
        type: e.type, size: e.size, modified: e.modified });
    }
    if (e.type === "directory") {
      const sub = dirPath ? `${dirPath}/${e.name}` : e.name;
      await walkSmb(config, sub, basePath, query, results);
    }
  }
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { path: relPath = "", q = "" } = getQuery(event);
  const query = String(q || "").toLowerCase().trim();
  if (!query) throw createError({ statusCode: 400, statusMessage: "Search query is required" });

  const resolved = resolveVirtualPath(String(relPath));
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  const results: SR[] = [];

  if (resolved.type === "smb") {
    await walkSmb(resolved.config, resolved.subPath, resolved.subPath, query, results);
  } else {
    walkDir(resolved.absPath, resolved.absPath, query, results);
  }

  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { query, path: relPath, results };
});
