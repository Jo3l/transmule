defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Browse user files",
    description: "Returns directory tree of a user's shared files. Results are cached for 5 minutes. Pass ?force=true to bypass cache.",
    responses: { 200: { description: "Browse result" }, 502: { description: "slskd error" } },
  },
});

import { getBrowseCache, setBrowseCache } from "../../../../utils/browseCache";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = decodeURIComponent(getRouterParam(event, "username") ?? "");
  if (!username) throw createError({ statusCode: 400, statusMessage: "username is required" });

  const query = getQuery(event);
  const force = query.force === "true";

  // Check cache (skip if force-refresh)
  if (!force) {
    const cached = getBrowseCache(username);
    if (cached) return cached;
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
      setBrowseCache(username, stripped);
      return stripped;
    }
    return data;
  } catch (err: any) {
    // On error, return stale cache if available (better than nothing)
    const stale = getBrowseCache(username);
    if (stale) {
      console.warn(`[slskd] browse error for ${username}, returning stale cache:`, err.message);
      return stale;
    }
    throw createError({ statusCode: 502, statusMessage: `slskd browse error: ${err.message}` });
  }
});
