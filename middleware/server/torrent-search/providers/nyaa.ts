/**
 * Nyaa.si provider — parses the public RSS 2.0 feed.
 *
 * Nyaa includes <nyaa:infoHash> and <nyaa:magnetLink> in each item so
 * we never need to scrape detail pages.
 */
import type { TorrentSearchResult } from "../types";

const TRACKERS = [
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:80",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://tracker.leechers-paradise.org:6969",
]
  .map((t) => `&tr=${encodeURIComponent(t)}`)
  .join("");

/** Parse a human-readable size string like "1.5 GiB" to bytes */
function parseSize(s: string): number | null {
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const map: Record<string, number> = {
    b: 1,
    kib: 1024,
    kb: 1024,
    mib: 1024 ** 2,
    mb: 1024 ** 2,
    gib: 1024 ** 3,
    gb: 1024 ** 3,
    tib: 1024 ** 4,
    tb: 1024 ** 4,
  };
  return Math.round(n * (map[unit] ?? 1));
}

/** Naive XML tag value extractor (works for well-formed RSS) */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
  );
  const m = xml.match(re);
  return m ? (m[1] ?? m[2] ?? "").trim() : "";
}

function buildMagnet(infoHash: string, name: string): string {
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${TRACKERS}`;
}

export async function searchNyaa(
  query: string,
  limit: number,
): Promise<TorrentSearchResult[]> {
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=0_0&f=0`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "TransMule/1.0 torrent-search" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const xml = await resp.text();

  // Split into <item> blocks
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const results: TorrentSearchResult[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null && results.length < limit) {
    const block = match[1];

    const title = extractTag(block, "title");
    const infoHash = extractTag(block, "nyaa:infoHash");
    const magnetLink = extractTag(block, "nyaa:magnetLink");
    const sizeStr = extractTag(block, "nyaa:size");
    const seeders = Number(extractTag(block, "nyaa:seeders")) || 0;
    const leechers = Number(extractTag(block, "nyaa:leechers")) || 0;
    const pubDate = extractTag(block, "pubDate");
    const category = extractTag(block, "nyaa:category");

    if (!title || (!infoHash && !magnetLink)) continue;

    const magnet = magnetLink || (infoHash ? buildMagnet(infoHash, title) : "");
    if (!magnet) continue;

    results.push({
      name: title,
      magnet,
      infoHash: infoHash || "",
      size: parseSize(sizeStr),
      seeders,
      leechers,
      uploadedAt: pubDate ? new Date(pubDate).toISOString() : null,
      source: "nyaa",
      category: category || "Anime",
    });
  }

  return results;
}
