import { searchTorrents } from "../torrent-search";
import { ensureProviders, getTorrentSearchProviders } from "../providers/loader";
import { getConfig } from "../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Torrent Search"],
    summary: "Search public torrent indexes",
    description:
      "Searches registered torrent-search plugins in parallel " +
      "and returns merged, deduplicated results sorted by seeders.\n\n" +
      "Sources: `all` | any registered torrent-search plugin id",
    responses: {
      200: { description: "Search results" },
      400: { description: "Missing or invalid query" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { q, source = "all", limit = "75" } = getQuery(event);

  if (!q || typeof q !== "string" || !q.trim()) {
    throw createError({ statusCode: 400, statusMessage: "q is required" });
  }

  await ensureProviders();
  const plugins = getTorrentSearchProviders();
  const validIds = plugins.map((p) => p.meta.id);

  const src =
    source === "all" || (typeof source === "string" && validIds.includes(source))
      ? (source as string)
      : "all";

  const limitN = Math.min(Math.max(Number(limit) || 75, 1), 200);

  const customTrackers = getConfig("bt_trackers") ?? "";
  const extraTrackers = customTrackers
    .split("\n")
    .map((tr) => tr.trim())
    .filter(Boolean)
    .map((tr) => `&tr=${encodeURIComponent(tr)}`)
    .join("");

  const results = await searchTorrents({
    query: q.trim(),
    source: src,
    limit: limitN,
    extraTrackers,
  });

  return { results, query: q.trim(), source: src, total: results.length };
});
