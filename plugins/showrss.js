/**
 * ShowRSS media provider plugin.
 *
 * Parses a ShowRSS personal feed (https://showrss.info/) and returns
 * TV show torrents as MediaItems with magnet links.
 *
 * The user must supply their ShowRSS feed URL in the "feed" filter.
 * Anonymous combined feed: https://showrss.info/other/all.rss
 */
export default {
  meta: {
    id: "showrss",
    name: "ShowRSS",
    icon: "mdi-rss",
    mediaType: "shows",
    description: "TV show torrents via your ShowRSS RSS feed.",
  },

  filters: [
    {
      key: "feed",
      label: "ShowRSS Feed URL",
      type: "text",
      defaultValue: "https://showrss.info/other/all.rss",
    },
  ],

  async list({ query, filters }) {
    const feedUrl = (filters?.feed || "").trim();
    if (!feedUrl) return { items: [] };

    const resp = await fetch(feedUrl, {
      headers: { "User-Agent": "TransMule/1.0 showrss" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return { items: [] };

    const xml = await resp.text();
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRe.exec(xml)) !== null) {
      const block = match[1];

      const title = extractTag(block, "title");
      // Prefer <torrent:magnetURI>, fall back to any magnet: link in the block
      const magnetLink =
        extractTag(block, "torrent:magnetURI") ||
        (block.match(/magnet:[^\s<"']+/) ?? [])[0] ||
        "";
      const link = extractTag(block, "link");
      const pubDate = extractTag(block, "pubDate");

      if (!title) continue;
      if (!magnetLink && !link) continue;

      // Filter by query (case-insensitive substring match)
      if (query && !title.toLowerCase().includes(query.toLowerCase())) continue;

      items.push({
        id: encodeURIComponent(title + (pubDate || "")),
        title,
        date: pubDate ? tryIso(pubDate) : undefined,
        isSeries: true,
        sourceUrl: link || undefined,
        links: magnetLink ? [{ url: magnetLink, label: title }] : [],
      });
    }

    return { items, total: items.length };
  },

  async cover(title) {
    try {
      const resp = await fetch(
        `https://www.episodate.com/api/search?q=${encodeURIComponent(title)}&page=1`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.tv_shows?.[0]?.image_thumbnail_path ?? null;
    } catch {
      return null;
    }
  },
};

function extractTag(xml, tag) {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
  );
  const m = xml.match(re);
  return m ? (m[1] ?? m[2] ?? "").trim() : "";
}

function tryIso(dateStr) {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return dateStr;
  }
}
