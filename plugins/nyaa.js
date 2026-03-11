/**
 * Nyaa.si torrent-search plugin.
 *
 * Parses the public RSS 2.0 feed — includes <nyaa:infoHash> and
 * <nyaa:magnetLink> so no detail-page scraping is needed.
 */
export default {
  meta: {
    id: "nyaa",
    name: "Nyaa",
    icon: "mdi-cat",
    pluginType: "torrent-search",
    description: "Anime and manga torrent index (nyaa.si).",
  },

  async search(query, limit, extraTrackers) {
    const TRACKERS = [
      "udp://open.demonii.com:1337/announce",
      "udp://tracker.openbittorrent.com:80",
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://tracker.leechers-paradise.org:6969",
    ]
      .map((t) => `&tr=${encodeURIComponent(t)}`)
      .join("");

    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=0_0&f=0`;

    const resp = await fetch(url, {
      headers: { "User-Agent": "TransMule/1.0 torrent-search" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];

    const xml = await resp.text();
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const results = [];
    let match;

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

      const magnet =
        magnetLink ||
        (infoHash
          ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}${TRACKERS}${extraTrackers}`
          : "");
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
  },
};

function parseSize(s) {
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const map = {
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

function extractTag(xml, tag) {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
  );
  const m = xml.match(re);
  return m ? (m[1] ?? m[2] ?? "").trim() : "";
}
