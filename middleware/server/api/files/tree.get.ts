import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

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

export default defineEventHandler((event) => {
  requireUser(event);

  const { depth = "4" } = getQuery(event);
  const maxDepth = Math.min(Number(depth) || 4, 8);

  const root = getDownloadsRoot();

  const tree = buildTree(root, "", maxDepth, 1);
  return tree;
});
