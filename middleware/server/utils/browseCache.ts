import { gzipSync, gunzipSync } from "node:zlib";

// ── In-memory browse cache (shared across browse + download-directory endpoints) ──
interface CacheEntry {
  data: Buffer; // gzipped JSON
  ts: number;
}

export const browseCache = new Map<string, CacheEntry>();
export const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface BrowseCacheData {
  directories: any[];
  lockedDirectories: any[];
}

export function getBrowseCache(username: string): BrowseCacheData | null {
  const cached = browseCache.get(username);
  if (!cached || Date.now() - cached.ts >= BROWSE_CACHE_TTL_MS) return null;
  try {
    return JSON.parse(gunzipSync(cached.data).toString());
  } catch {
    browseCache.delete(username);
    return null;
  }
}

export function setBrowseCache(username: string, data: BrowseCacheData): void {
  const compressed = gzipSync(JSON.stringify(data));
  browseCache.set(username, { data: compressed, ts: Date.now() });
}
