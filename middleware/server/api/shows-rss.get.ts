const RSS_URL = "https://showrss.info/other/shows.rss";

interface Episode {
  title: string;
  magnet: string;
}

interface ShowItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  episodes: Episode[];
}

function extractTag(xml: string, tag: string): string {
  const cdataRe = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
    "i",
  );
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = cdataRe.exec(xml) || plainRe.exec(xml);
  return m ? m[1].trim() : "";
}

function stripHtml(html: string): string {
  return (
    html
      // Decode entities first so encoded tags like &lt;p&gt; become real tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      // Strip all HTML tags (including any newly revealed after entity decoding)
      .replace(/<[^>]+>/g, " ")
      // Collapse whitespace and trim
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function browseToRssUrl(browseUrl: string): string {
  // https://showrss.info/browse/1914 → https://showrss.info/show/1914.rss
  return browseUrl.replace(/\/browse\/([0-9]+)$/, "/show/$1.rss");
}

function parseItems(xml: string): Omit<ShowItem, "episodes">[] {
  const items: Omit<ShowItem, "episodes">[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title: stripHtml(extractTag(block, "title")),
      link: extractTag(block, "link"),
      guid: extractTag(block, "guid"),
      pubDate: extractTag(block, "pubDate"),
      description: stripHtml(extractTag(block, "description")),
    });
  }
  return items;
}

async function fetchEpisodes(browseUrl: string): Promise<Episode[]> {
  const rssUrl = browseToRssUrl(browseUrl);
  if (rssUrl === browseUrl) return []; // URL didn't match expected pattern
  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "TransMule/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const episodes: Episode[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = stripHtml(extractTag(block, "title"));
      // In show feeds the <link> element is the magnet URI directly
      const link = extractTag(block, "link");
      if (link.startsWith("magnet:")) {
        episodes.push({ title, magnet: link });
      }
    }
    return episodes;
  } catch {
    return [];
  }
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  let xml: string;
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": "TransMule/1.0" },
    });
    if (!res.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: "Failed to fetch shows RSS",
      });
    }
    xml = await res.text();
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch shows RSS",
    });
  }

  const parsed = parseItems(xml);

  // Fetch per-show episode RSS feeds in parallel
  const episodeLists = await Promise.all(
    parsed.map((item) => fetchEpisodes(item.link)),
  );

  const items: ShowItem[] = parsed.map((item, i) => ({
    ...item,
    episodes: episodeLists[i],
  }));

  return { items };
});
