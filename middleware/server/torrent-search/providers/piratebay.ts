/**
 * The Pirate Bay provider — uses the apibay.org JSON API.
 *
 * No HTML scraping needed; apibay returns a JSON array directly.
 * Magnet links are constructed from the info_hash + common trackers.
 */
import type { TorrentSearchResult } from "../types";

const TRACKERS = [
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:80",
  "udp://tracker.coppersurfer.tk:6969",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://torrent.gresille.org:80/announce",
  "udp://p4p.arenabg.com:1337",
  "udp://tracker.leechers-paradise.org:6969",
]
  .map((t) => `&tr=${encodeURIComponent(t)}`)
  .join("");

/** Map numeric TPB category IDs to human-readable strings */
function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    "100": "Audio",
    "200": "Video",
    "201": "Movies",
    "202": "Movies DVDR",
    "203": "Music Videos",
    "204": "Movie Clips",
    "205": "TV Shows",
    "206": "Handheld",
    "207": "HD Movies",
    "208": "HD TV Shows",
    "209": "3D",
    "299": "Other Video",
    "300": "Applications",
    "301": "Windows",
    "302": "Mac",
    "303": "UNIX",
    "304": "Handheld",
    "305": "iOS",
    "306": "Android",
    "399": "Other Apps",
    "400": "Games",
    "401": "PC",
    "402": "Mac",
    "403": "PSx",
    "404": "XBOX360",
    "405": "Wii",
    "406": "Handheld",
    "407": "iOS",
    "408": "Android",
    "499": "Other Games",
    "500": "Porn",
    "600": "Other",
    "601": "E-books",
    "602": "Comics",
    "603": "Pictures",
    "604": "Covers",
    "605": "Physibles",
    "699": "Other",
  };
  return map[cat] ?? "Other";
}

function buildMagnet(
  infoHash: string,
  name: string,
  extraTrackers = "",
): string {
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${TRACKERS}${extraTrackers}`;
}

interface ApiItem {
  name: string;
  info_hash: string;
  leechers: string;
  seeders: string;
  size: string;
  added: string;
  category: string;
}

export async function searchPirateBay(
  query: string,
  limit: number,
  extraTrackers = "",
): Promise<TorrentSearchResult[]> {
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=0`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "TransMule/1.0 torrent-search" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const items: ApiItem[] = await resp.json();

  // apibay returns a sentinel result when nothing is found
  if (
    items.length === 1 &&
    items[0].info_hash === "0000000000000000000000000000000000000000"
  ) {
    return [];
  }

  return items.slice(0, limit).map((item) => ({
    name: item.name,
    magnet: buildMagnet(item.info_hash, item.name, extraTrackers),
    infoHash: item.info_hash,
    size: item.size ? Number(item.size) : null,
    seeders: Number(item.seeders) || 0,
    leechers: Number(item.leechers) || 0,
    uploadedAt: item.added
      ? new Date(Number(item.added) * 1000).toISOString()
      : null,
    source: "tpb" as const,
    category: categoryLabel(item.category),
  }));
}
