import { searchTorrents } from "../torrent-search";
import type { TorrentSource } from "../torrent-search";
import { getConfig } from "../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Torrent Search"],
    summary: "Search public torrent indexes",
    description:
      "Searches The Pirate Bay (apibay.org), Nyaa.si and YTS.mx in parallel " +
      "and returns merged, deduplicated results sorted by seeders.\n\n" +
      "Sources: `all` | `tpb` | `nyaa` | `yts`",
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

  const validSources = ["all", "tpb", "nyaa", "yts"];
  const src = (
    typeof source === "string" && validSources.includes(source) ? source : "all"
  ) as TorrentSource | "all";

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
