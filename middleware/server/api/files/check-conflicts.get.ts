import { stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { resolveVirtualPath, smbStat, smbListDir } from "../../utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Check conflicts",
    parameters: [{ name: "sources", in: "query" }, { name: "destination", in: "query" }],
    responses: { 200: {} } },
});

async function collectPaths(relPath: string): Promise<string[]> {
  const r = resolveVirtualPath(relPath);
  if (!r) return [];
  if (r.type === "local") {
    try {
      const s = await stat(r.absPath);
      if (!s.isDirectory()) return [""];
      return walkLocal(r.absPath, "");
    } catch { return []; }
  }
  try {
    const st = await smbStat(r.config, r.subPath);
    if (!st || st.type !== "directory") return [""];
    return walkSmb(r.config, r.subPath, "");
  } catch { return []; }
}

async function walkLocal(absDir: string, relPrefix: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const e of entries) {
    const cr = relPrefix ? `${relPrefix}/${e.name}` : e.name;
    if (e.isDirectory()) results.push(...await walkLocal(join(absDir, e.name), cr));
    else results.push(cr);
  }
  return results;
}

async function walkSmb(config: any, dir: string, relPrefix: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await smbListDir(config, dir);
  for (const e of entries) {
    const cr = relPrefix ? `${relPrefix}/${e.name}` : e.name;
    if (e.type === "directory") results.push(...await walkSmb(config, dir ? `${dir}/${e.name}` : e.name, cr));
    else results.push(cr);
  }
  return results;
}

async function exists(relPath: string): Promise<boolean> {
  const r = resolveVirtualPath(relPath);
  if (!r) return false;
  if (r.type === "local") return existsSync(r.absPath);
  try { return !!(await smbStat(r.config, r.subPath)); } catch { return false; }
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const query = getQuery(event);
  let sources = query.sources;
  if (!Array.isArray(sources)) sources = sources ? [String(sources)] : [];
  const destination = String(query.destination || "");
  if (!sources.length || !destination)
    throw createError({ statusCode: 400, statusMessage: "sources[] and destination required" });

  const conflicts: string[] = [];
  for (const src of sources as string[]) {
    const targetRel = join(destination, basename(src)).replace(/\\/g, "/");
    const children = await collectPaths(src);
    for (const child of children) {
      const ct = child ? join(destination, basename(src), child).replace(/\\/g, "/") : targetRel;
      if (await exists(ct)) conflicts.push(ct);
    }
  }
  return { conflicts };
});
