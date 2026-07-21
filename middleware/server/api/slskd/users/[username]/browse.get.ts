defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Browse user files",
    description: "Returns directory tree of a user's shared files. Results are cached for 5 minutes. Pass ?force=true to bypass cache.",
    responses: { 200: { description: "Browse result" }, 502: { description: "slskd error" } },
  },
});

import { gzipSync, gunzipSync } from "node:zlib";

// ── In-memory browse cache (persists across requests within the server process) ──
interface CacheEntry {
  data: Buffer;  // gzipped JSON
  ts: number;
}
const _browseCache = new Map<string, CacheEntry>();
const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = decodeURIComponent(getRouterParam(event, "username") ?? "");
  if (!username) throw createError({ statusCode: 400, statusMessage: "username is required" });

  const query = getQuery(event);
  const force = query.force === "true";

  // Check cache (skip if force-refresh)
  if (!force) {
    const cached = _browseCache.get(username);
    if (cached && Date.now() - cached.ts < BROWSE_CACHE_TTL_MS) {
      return JSON.parse(gunzipSync(cached.data).toString());
    }
  }

  try {
    const data = await client.browseUserFiles(username);
    if (data) {
      // Strip per-file metadata to keep cache lean
      const stripFile = (f: any) => ({ filename: f.filename, size: f.size });
      const stripped = {
        directories: (data.directories || []).map((d: any) => ({
          ...d, files: (d.files || []).map(stripFile),
        })),
        lockedDirectories: (data.lockedDirectories || []).map((d: any) => ({
          ...d, files: (d.files || []).map(stripFile), locked: true,
        })),
      };
      const compressed = gzipSync(JSON.stringify(stripped));
      _browseCache.set(username, { data: compressed, ts: Date.now() });
      return stripped;
    }
    return data;
  } catch (err: any) {
    // On error, return stale cache if available (better than nothing)
    const stale = _browseCache.get(username);
    if (stale) {
      console.warn(`[slskd] browse error for ${username}, returning stale cache:`, err.message);
      return JSON.parse(gunzipSync(stale.data).toString());
    }
    throw createError({ statusCode: 502, statusMessage: `slskd browse error: ${err.message}` });
  }
});
