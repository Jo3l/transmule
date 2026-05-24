import { getDownloadHistoryItems } from "../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Download History"],
    summary: "Get download history",
    description: "Returns the last 500 download history entries.",
    responses: {
      200: { description: "Download history" },
    },
  },
});

function extractBtiHash(url: string): string | null {
  // Magnet: urn:btih:HASH
  const m = url.match(/urn:btih:([A-Za-z0-9]+)/i);
  if (m) return m[1].toLowerCase();
  // ED2K: ed2k:HASH or ed2k://|file|...|HASH|/
  const ed2k = url.match(/ed2k[:\/]+([a-fA-F0-9]{32})/);
  if (ed2k) return ed2k[1].toLowerCase();
  return null;
}

export default defineEventHandler((event) => {
  const { userId } = requireUser(event);
  const items = getDownloadHistoryItems(userId);

  const urls = items.map((i) => i.url);
  const titles = items
    .map((i) => i.title)
    .filter((t): t is string => t !== null && t !== "");
  const hashes = urls
    .map((u) => extractBtiHash(u))
    .filter((h): h is string => h !== null);

  return { urls, titles, hashes };
});
