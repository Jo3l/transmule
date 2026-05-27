import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getProvider, loadMounts } from "~/utils/remoteMounts";
import { getCachedTree, setCachedTree } from "~/utils/treeCache";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

// ── Simple TTL cache ────────────────────────────────────────────────────────
// (cache lives in ~/utils/treeCache)

function buildTree(
  dir: string,
  relBase: string,
  maxDepth: number,
  depth: number,
): TreeNode[] {
  if (depth > maxDepth) return [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => !n.startsWith("."))
    .map((name) => {
      const full = join(dir, name);
      try {
        const st = statSync(full);
        if (!st.isDirectory()) return null;
      } catch {
        return null;
      }
      const relPath = relBase ? `${relBase}/${name}` : name;
      return {
        name,
        path: relPath,
        children: buildTree(full, relPath, maxDepth, depth + 1),
      } satisfies TreeNode;
    })
    .filter(Boolean) as TreeNode[];
}

async function buildRemoteTree(
  mount: { name: string; id: string },
  maxDepth: number,
): Promise<TreeNode[]> {
  if (maxDepth < 1) return [];
  try {
    const provider = getProvider(mount as any);
    await provider.connect();
    const entries = await provider.readdir("");
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const children = maxDepth > 1
        ? await buildRemoteChildren(provider, mount.name, entry.name, maxDepth - 1)
        : [];
      nodes.push({
        name: entry.name,
        path: `${mount.name}/${entry.name}`,
        children,
      });
    }
    return nodes;
  } catch {
    return [];
  }
}

async function buildRemoteChildren(
  provider: any,
  mountName: string,
  parentPath: string,
  maxDepth: number,
): Promise<TreeNode[]> {
  if (maxDepth < 1) return [];
  try {
    const entries = await provider.readdir(parentPath);
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const rel = `${parentPath}/${entry.name}`;
      const children = maxDepth > 1
        ? await buildRemoteChildren(provider, mountName, rel, maxDepth - 1)
        : [];
      nodes.push({
        name: entry.name,
        path: `${mountName}/${rel}`,
        children,
      });
    }
    return nodes;
  } catch {
    return [];
  }
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  // Check cache first
  const cached = getCachedTree();
  if (cached) return cached;

  const { depth = "4" } = getQuery(event);
  const maxDepth = Math.min(Number(depth) || 4, 8);

  const root = getDownloadsRoot();
  const tree = buildTree(root, "", maxDepth, 1);

  // Inject remote mounts with their children
  for (const mount of loadMounts()) {
    const children = await buildRemoteTree(mount, maxDepth - 1);
    tree.push({
      name: mount.name,
      path: mount.name,
      children,
    });
  }

  setCachedTree(tree);
  return tree;
});
