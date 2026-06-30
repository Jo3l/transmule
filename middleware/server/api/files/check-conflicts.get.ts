import { stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Check for file conflicts before transfer",
    parameters: [
      { name: "sources", in: "query", description: "Source paths" },
      { name: "destination", in: "query", description: "Destination directory" },
    ],
    responses: { 200: { description: "List of conflicting paths" }, 400: { description: "Invalid" } },
  },
});

async function collectChildPaths(relPath: string): Promise<string[]> {
  const realPath = resolveVirtualPath(relPath);
  if (!realPath) return [];
  try {
    const s = await stat(realPath);
    if (!s.isDirectory()) return [""];
    return await collectLocalPaths(realPath, "");
  } catch { return []; }
}

async function collectLocalPaths(absDir: string, relPrefix: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await collectLocalPaths(join(absDir, entry.name), childRel));
    } else {
      results.push(childRel);
    }
  }
  return results;
}

async function pathExists(relPath: string): Promise<boolean> {
  const realPath = resolveVirtualPath(relPath);
  if (!realPath) return false;
  try { return existsSync(realPath); } catch { return false; }
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const query = getQuery(event);
  let sources = query.sources;
  if (!Array.isArray(sources)) sources = sources ? [String(sources)] : [];
  const destination = String(query.destination || "");
  if (!sources.length || !destination) {
    throw createError({ statusCode: 400, statusMessage: "sources[] and destination are required" });
  }

  const conflicts: string[] = [];
  for (const src of sources as string[]) {
    const targetRel = join(destination, basename(src)).replace(/\\/g, "/");
    const childPaths = await collectChildPaths(src);
    for (const child of childPaths) {
      const childTarget = child ? join(destination, basename(src), child).replace(/\\/g, "/") : targetRel;
      if (await pathExists(childTarget)) conflicts.push(childTarget);
    }
  }
  return { conflicts };
});
