import type {
  MediaProvider,
  MediaItem,
  MediaEpisode,
  ProviderListResult,
  ProviderSearchParams,
} from "../types";

const RSS_URL = "https://showrss.info/other/shows.rss";

// ── RSS helpers ────────────────────────────────────────────────────────

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
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function browseToRssUrl(browseUrl: string): string {
  return browseUrl.replace(/\/browse\/([0-9]+)$/, "/show/$1.rss");
}

interface RawShow {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
}

function parseItems(xml: string): RawShow[] {
  const items: RawShow[] = [];
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

interface RawEpisode {
  title: string;
  magnet: string;
}

async function fetchEpisodes(browseUrl: string): Promise<RawEpisode[]> {
  const rssUrl = browseToRssUrl(browseUrl);
  if (rssUrl === browseUrl) return [];
  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "TransMule/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const episodes: RawEpisode[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = stripHtml(extractTag(block, "title"));
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

// ── Cover lookup via episodate ─────────────────────────────────────────

const _coverCache = new Map<string, { ts: number; image: string | null }>();
const COVER_TTL = 24 * 60 * 60 * 1000;

async function lookupCover(title: string): Promise<string | null> {
  const key = title.toLowerCase();
  const cached = _coverCache.get(key);
  if (cached && Date.now() - cached.ts < COVER_TTL) return cached.image;

  try {
    const res = await fetch(
      `https://www.episodate.com/api/search?q=${encodeURIComponent(title)}`,
      { headers: { "User-Agent": "TransMule/1.0" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tv_shows?: { image_thumbnail_path?: string }[];
    };
    const image = data.tv_shows?.[0]?.image_thumbnail_path ?? null;
    _coverCache.set(key, { ts: Date.now(), image });
    return image;
  } catch {
    return null;
  }
}

// ── Provider ───────────────────────────────────────────────────────────

const provider: MediaProvider = {
  meta: {
    id: "showrss",
    name: "ShowRSS",
    icon: "mdi-rss",
    mediaType: "shows",
    description: "ShowRSS.info TV show magnet feeds",
  },

  async list(_params: ProviderSearchParams): Promise<ProviderListResult> {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": "TransMule/1.0" },
    });
    if (!res.ok) throw new Error(`ShowRSS error: ${res.status}`);
    const xml = await res.text();
    const parsed = parseItems(xml);

    // Fetch episodes in parallel
    const episodeLists = await Promise.all(
      parsed.map((item) => fetchEpisodes(item.link)),
    );

    const items: MediaItem[] = parsed.map((show, i) => {
      const eps: MediaEpisode[] = episodeLists[i].map((ep) => ({
        code: ep.title,
        links: [{ label: ep.title, url: ep.magnet }],
      }));

      return {
        id: show.guid,
        title: show.title,
        date: show.pubDate,
        description: show.description,
        links: [],
        episodes: eps,
        isSeries: true,
        sourceUrl: show.link,
        needsDetail: false,
      };
    });

    return { items };
  },

  async cover(title: string): Promise<string | null> {
    return lookupCover(title);
  },
};

export default provider;
