const DEFAULT_URL = "https://www21.dontorrent.link/ultimos";
const BASE_ORIGIN = "https://www21.dontorrent.link";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "text/html",
};

export interface DonTorrentMovie {
  id: string;
  title: string;
  url: string;
  cover: string;
  format: string;
  date: string;
}

function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse a listing page (descargar-peliculas / ultimos / etc.)
 * Extracts: movie page URL, cover image (from inline <img>), title (from alt/slug), format/date from text.
 */
function parseListingPage(html: string): DonTorrentMovie[] {
  const seen = new Set<string>();
  const movies: DonTorrentMovie[] = [];

  // Approach 1: card-based pages — each card wraps an <a href="/pelicula/..."> or <a href="/serie/..."><img ...></a>
  // Series use double-ID path: /serie/ID/ID/slug — capture only first ID and final slug segment
  const cardRe =
    /<a[^>]+href=["']((?:https?:\/\/[^"']*)?\/(pelicula|serie)\/(\d+)(?:\/\d+)?\/([^"'#?/]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
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

    movies.push({ id, title, url, cover, format, date: "" });
  }

  // Approach 2: /ultimos text list
  // Actual HTML: <span class='text-muted'>2026-03-06</span> <a href='pelicula/ID/slug'>Title</a> <span class='text-muted'>(Format)</span>
  // Note: href has NO leading slash, date/format are wrapped in <span> tags
  if (movies.length === 0) {
    const listRe =
      />(\d{4}-\d{2}-\d{2})<\/span>\s*<a[^>]+href=["']((?:https?:\/\/[^"']*)?\/?\b(?:pelicula|serie)\/(\d+)(?:\/\d+)?\/([^"'#?/\s]+))["'][^>]*>([^<]+)<\/a>(?:\s*<span[^>]*>\s*\(([^)]+)\)\s*<\/span>)?/gi;
    while ((m = listRe.exec(html)) !== null) {
      const [, date, rawHref, id, slug, titleRaw, format] = m;
      const href = rawHref.startsWith("/") ? rawHref : "/" + rawHref;
      const url = rawHref.startsWith("http") ? rawHref : BASE_ORIGIN + href;
      if (seen.has(url)) continue;
      seen.add(url);
      const title = titleRaw.trim() || slugToTitle(slug);
      movies.push({
        id,
        title,
        url,
        cover: "",
        format: format ?? "",
        date: date ?? "",
      });
    }
  }

  return movies.slice(0, 24);
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const _cache = new Map<
  string,
  { ts: number; data: ReturnType<typeof parseListingPage> }
>();

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const listUrl = (query.url as string) || DEFAULT_URL;

  const cached = _cache.get(listUrl);
  if (cached && Date.now() - cached.ts < SIX_HOURS_MS) {
    return { movies: cached.data, sourceUrl: listUrl };
  }

  let listHtml: string;
  try {
    const res = await fetch(listUrl, { headers: FETCH_HEADERS });
    if (!res.ok) {
      throw createError({
        statusCode: res.status,
        statusMessage: `DonTorrent error: ${res.status}`,
      });
    }
    listHtml = await res.text();
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: err.message || "Failed to fetch DonTorrent",
    });
  }

  const movies = parseListingPage(listHtml);
  _cache.set(listUrl, { ts: Date.now(), data: movies });
  return { movies, sourceUrl: listUrl };
});
