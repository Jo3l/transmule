import type {
  MediaProvider,
  MediaItem,
  ProviderListResult,
  ProviderSearchParams,
} from "../types";

const DEFAULT_URL = "https://www21.dontorrent.link/ultimos";
const BASE_ORIGIN = "https://www21.dontorrent.link";
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "text/html",
};

// ── Scraper helpers ────────────────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RawItem {
  id: string;
  title: string;
  url: string;
  cover: string;
  format: string;
  date: string;
}

function parseListingPage(html: string): RawItem[] {
  const seen = new Set<string>();
  const items: RawItem[] = [];

  const cardRe =
    /<a[^>]+href=["']((?:https?:\/\/[^"']*)?\/(pelicula)\/(\d+)(?:\/\d+)?\/([^"'#?/]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = cardRe.exec(html)) !== null) {
    const [, rawHref, , id, slug, inner] = m;
    const url = rawHref.startsWith("http") ? rawHref : BASE_ORIGIN + rawHref;
    if (seen.has(url)) continue;
    seen.add(url);

    const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(inner);
    const cover = imgMatch?.[1] ?? "";
    const altMatch = /<img[^>]+alt=["']([^"']+)["']/i.exec(inner);
    const title = altMatch ? altMatch[1].trim() : slugToTitle(slug);
    const fmtMatch = /\(([^)]+)\)/.exec(inner);
    const format = fmtMatch?.[1] ?? "";

    items.push({ id, title, url, cover, format, date: "" });
  }

  if (items.length === 0) {
    const listRe =
      />(\d{4}-\d{2}-\d{2})<\/span>\s*<a[^>]+href=["']((?:https?:\/\/[^"']*)?\/?\bpelicula\/(\d+)(?:\/\d+)?\/([^"'#?/\s]+))["'][^>]*>([^<]+)<\/a>(?:\s*<span[^>]*>\s*\(([^)]+)\)\s*<\/span>)?/gi;
    while ((m = listRe.exec(html)) !== null) {
      const [, date, rawHref, id, slug, titleRaw, format] = m;
      const href = rawHref.startsWith("/") ? rawHref : "/" + rawHref;
      const url = rawHref.startsWith("http") ? rawHref : BASE_ORIGIN + href;
      if (seen.has(url)) continue;
      seen.add(url);
      items.push({
        id,
        title: titleRaw.trim() || slugToTitle(slug),
        url,
        cover: "",
        format: format ?? "",
        date: date ?? "",
      });
    }
  }

  return items.slice(0, 24);
}

// ── Detail page parser ─────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&oacute;/g, "ó")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&uuml;/g, "ü")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractField(html: string, label: string): string {
  const re = new RegExp(
    `<b[^>]*>\\s*${label}[:\\s]*<\\/b>\\s*([\\s\\S]*?)(?=<\\/p>|<p|<br|<b[^>]*>bold|$)`,
    "i",
  );
  const m = re.exec(html);
  return m ? stripTags(m[1]) : "";
}

function parseDetailPage(html: string): Partial<MediaItem> {
  const coverMatch =
    /img[^>]+src=["'](https?:\/\/(?:images\.weserv\.nl|[^"']*cdnbeta[^"']*|[^"']*imagenes\/peliculas[^"']*))["']/i.exec(
      html,
    );
  const cover = coverMatch?.[1] ?? "";

  const torrentMatch =
    /href=["']((?:https?:)?\/\/[^"']*\.torrent[^"']*)["']/i.exec(html);
  let torrentUrl = "";
  if (torrentMatch) {
    const raw = torrentMatch[1];
    torrentUrl = raw.startsWith("//") ? "https:" + raw : raw;
  }

  const year = extractField(html, "A[ñn]o");
  const genre = extractField(html, "G[eé]nero");
  const director = extractField(html, "Director");
  const actors = extractField(html, "Actores");
  const format = extractField(html, "Formato");
  const size = extractField(html, "Tama[ñn]o");

  const descMatch =
    /<b[^>]*>Descripci[oó]n[:\s]*<\/b>\s*([\s\S]*?)(?:<\/p>|<a\s+href="\/descargar)/i.exec(
      html,
    );
  const description = descMatch ? stripTags(descMatch[1]) : "";

  return {
    cover,
    year,
    genre,
    director,
    actors,
    format,
    size,
    description,
    links: torrentUrl ? [{ label: format || "Download", url: torrentUrl }] : [],
  };
}

// ── Cache ──────────────────────────────────────────────────────────────

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const _listCache = new Map<string, { ts: number; data: RawItem[] }>();
const _detailCache = new Map<
  string,
  { ts: number; data: Partial<MediaItem> }
>();

// ── Provider ───────────────────────────────────────────────────────────

const provider: MediaProvider = {
  meta: {
    id: "dontorrent-movies",
    name: "DonTorrent",
    icon: "mdi-movie-play",
    mediaType: "movies",
    description: "DonTorrent movie torrents (Spanish)",
  },

  async list(params: ProviderSearchParams): Promise<ProviderListResult> {
    const listUrl = params.url || DEFAULT_URL;

    const cached = _listCache.get(listUrl);
    if (cached && Date.now() - cached.ts < SIX_HOURS_MS) {
      return { items: cached.data.map(toMediaItem) };
    }

    const res = await fetch(listUrl, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`DonTorrent error: ${res.status}`);
    const html = await res.text();
    const raw = parseListingPage(html);
    _listCache.set(listUrl, { ts: Date.now(), data: raw });
    return { items: raw.map(toMediaItem) };
  },

  async detail(sourceUrl: string): Promise<Partial<MediaItem>> {
    const cached = _detailCache.get(sourceUrl);
    if (cached && Date.now() - cached.ts < SIX_HOURS_MS) return cached.data;

    const res = await fetch(sourceUrl, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`DonTorrent detail error: ${res.status}`);
    const html = await res.text();
    const result = parseDetailPage(html);
    _detailCache.set(sourceUrl, { ts: Date.now(), data: result });
    return result;
  },
};

function toMediaItem(r: RawItem): MediaItem {
  return {
    id: r.id,
    title: r.title,
    cover: r.cover || undefined,
    date: r.date || undefined,
    format: r.format || undefined,
    links: [],
    sourceUrl: r.url,
    needsDetail: true,
    isSeries: false,
  };
}

export default provider;
