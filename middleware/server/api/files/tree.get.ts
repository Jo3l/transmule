import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSmbMountPath, loadSmbConfigs } from "../../utils/remoteMounts";
import { getDownloadsRoot } from "../../utils/files";
import { getCachedTree, setCachedTree } from "~/utils/treeCache";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Get folder tree",
    description: "Returns a recursive directory tree for the file browser sidebar.",
    parameters: [
      { name: "depth", in: "query", description: "Max depth (default 4, max 8)" },
    ],
    responses: {
      200: { description: "Tree nodes" },
    },
  },
});

interface TreeNode { name: string; path: string; children: TreeNode[]; }

function buildTree(dir: string, relBase: string, maxDepth: number, depth: number): TreeNode[] {
  if (depth > maxDepth) return [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => !n.startsWith("."))
    .map((name) => {
      const full = join(dir, name);
      try { if (!statSync(full).isDirectory()) return null; } catch { return null; }
      const relPath = relBase ? `${relBase}/${name}` : name;
      return { name, path: relPath, children: buildTree(full, relPath, maxDepth, depth + 1) };
    })
    .filter(Boolean) as TreeNode[];
}

function buildMountTree(name: string, mountPath: string, maxDepth: number): TreeNode[] {
  if (maxDepth < 1) return [];
  try {
    return buildTree(mountPath, name, maxDepth, 1);
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

  // Add SMB mount entries at top level
  for (const cfg of loadSmbConfigs()) {
    const mountPath = getSmbMountPath(cfg.name);
    try {
      const mtree = buildMountTree(cfg.name, mountPath, maxDepth - 1);
      tree.push({ name: cfg.name, path: cfg.name, children: mtree });
    } catch { /* skip inaccessible mounts */ }
  }

  setCachedTree(tree);
  return tree;
});
