import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDownloadsRoot, loadSmbConfigs, smbListDir } from "../../utils/remoteMounts";
import { getCachedTree, setCachedTree } from "~/utils/treeCache";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Get folder tree",
    parameters: [{ name: "depth", in: "query" }],
    responses: { 200: {} } },
});

interface TreeNode { name: string; path: string; children: TreeNode[]; }

function buildTree(dir: string, relBase: string, maxDepth: number, depth: number): TreeNode[] {
  if (depth > maxDepth) return [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => !n.startsWith(".")).map((name) => {
    const full = join(dir, name);
    try { if (!statSync(full).isDirectory()) return null; } catch { return null; }
    const rp = relBase ? `${relBase}/${name}` : name;
    return { name, path: rp, children: buildTree(full, rp, maxDepth, depth + 1) };
  }).filter(Boolean) as TreeNode[];
}

async function buildSmbTree(
  name: string, config: any, subPath: string, maxDepth: number,
): Promise<TreeNode[]> {
  if (maxDepth < 1) return [];
  try {
    const entries = await smbListDir(config, subPath);
    const nodes: TreeNode[] = [];
    for (const e of entries) {
      if (e.type !== "directory") continue;
      const childPath = subPath ? `${subPath}/${e.name}` : e.name;
      const children = maxDepth > 1 ? await buildSmbTree(name, config, childPath, maxDepth - 1) : [];
      nodes.push({ name: e.name, path: `${name}/${childPath}`, children });
    }
    return nodes;
  } catch { return []; }
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const cached = getCachedTree();
  if (cached) return cached;

  const { depth = "4" } = getQuery(event);
  const maxDepth = Math.min(Number(depth) || 4, 8);

  const root = getDownloadsRoot();
  const tree = buildTree(root, "downloads", maxDepth, 1);

  for (const cfg of loadSmbConfigs()) {
    try {
      const children = await buildSmbTree(cfg.name, cfg, "", maxDepth - 1);
      tree.push({ name: cfg.name, path: cfg.name, children });
    } catch { /* skip */ }
  }

  setCachedTree(tree);
  return tree;
});
