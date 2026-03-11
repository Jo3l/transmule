/**
 * YTS.mx torrent-search plugin.
 *
 * Uses the YTS JSON API for movie torrent search.
 * Returns all quality variants per movie as separate rows.
 */
export default {
  meta: {
    id: "yts",
    name: "YTS",
    icon: "mdi-filmstrip",
    pluginType: "torrent-search",
    description: "Movie torrents from YTS.mx (high-quality encodes).",
  },

  async search(query, limit, extraTrackers) {
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

    const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=50&page=1`;

    const resp = await fetch(url, {
      headers: { "User-Agent": "TransMule/1.0 torrent-search" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];

    const json = await resp.json();
    if (json.status !== "ok") return [];

    const movies = json.data.movies ?? [];
    const results = [];

    for (const movie of movies) {
      if (!movie.torrents?.length) continue;
      for (const t of movie.torrents) {
        if (results.length >= limit) break;
        const label = `${movie.title_long} [${t.quality} ${t.type}]`;
        results.push({
          name: label,
          magnet: `magnet:?xt=urn:btih:${t.hash.toUpperCase()}&dn=${encodeURIComponent(label)}${TRACKERS}${extraTrackers}`,
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
  },
};
