// ── Tree cache state (shared between tree.get.ts and cache-invalidate.post.ts) ──

interface CacheNode {
  name: string;
  path: string;
  children: CacheNode[];
}

let cachedTree: CacheNode[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 3000; // 3 seconds

export function getCachedTree(): any[] | null {
  if (cachedTree && Date.now() - cacheTime < CACHE_TTL) {
    return cachedTree;
  }
  return null;
}

export function setCachedTree(tree: any[]) {
  cachedTree = tree;
  cacheTime = Date.now();
}

export function invalidateTreeCache() {
  cachedTree = null;
  cacheTime = 0;
}
