/**
 * YTS.mx provider — JSON API for movies.
 *
 * Returns multiple quality variants per movie. We include all variants
 * as separate result rows so the user can pick resolution.
 */
import type { TorrentSearchResult } from "../types";

const TRACKERS = [
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:80",
  "udp://tracker.coppersurfer.tk:6969",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://p4p.arenabg.com:1337",
  "udp://tracker.leechers-paradise.org:6969",
]
  .map((t) => `&tr=${encodeURIComponent(t)}`)
  .join("");

function buildMagnet(hash: string, title: string, extraTrackers = ""): string {
  return `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=${encodeURIComponent(title)}${TRACKERS}${extraTrackers}`;
}

interface YtsTorrent {
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size_bytes: number;
  date_uploaded: string;
}

interface YtsMovie {
  title_long: string;
  genres?: string[];
  torrents?: YtsTorrent[];
}

interface YtsResponse {
  status: string;
  data: {
    movies?: YtsMovie[];
  };
}

export async function searchYts(
  query: string,
  limit: number,
  extraTrackers = "",
): Promise<TorrentSearchResult[]> {
  const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=50&page=1`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "TransMule/1.0 torrent-search" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const json: YtsResponse = await resp.json();
  if (json.status !== "ok") return [];

  const movies = json.data.movies ?? [];
  const results: TorrentSearchResult[] = [];

  for (const movie of movies) {
    if (!movie.torrents?.length) continue;
    for (const t of movie.torrents) {
      if (results.length >= limit) break;
      const label = `${movie.title_long} [${t.quality} ${t.type}]`;
      results.push({
        name: label,
        magnet: buildMagnet(t.hash, label, extraTrackers),
        infoHash: t.hash,
        size: t.size_bytes || null,
        seeders: t.seeds || 0,
        leechers: t.peers || 0,
        uploadedAt: t.date_uploaded
          ? new Date(t.date_uploaded).toISOString()
          : null,
        source: "yts",
        category: movie.genres?.join(", ") || "Movies",
      });
    }
    if (results.length >= limit) break;
  }

  return results;
}
