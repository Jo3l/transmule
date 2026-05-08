/**
 * Proxy endpoint for TMDB / TVDB poster lookup.
 *
 * Cleans the filename using smart-rename logic,
 * queries TMDB first (more reliable), falls back to TVDB,
 * validates matches by word overlap.
 *
 * GET /api/cover?title=Inception&year=2010&type=movie
 *
 * Response: CoverResult shape (poster, source, match info, confidence)
 */
import { getConfig } from "../utils/database";

// ── Noise patterns (same as smart-rename) ───────────────────────────────────

const NOISE_TAGS_RE =
  /\s*[\[\(][^\[\]()]*(?:720p|1080p|2160p|4K|HDTV|BluRay|WEB-DL|WEBRip|DVDRip|x264|x265|HEVC|AAC|AC3|H\.?264|H\.?265|XviD|DivX|HDR|SDR|REPACK|PROPER|EXTENDED|THEATRICAL|REMASTERED)[^\[\]()]*[\]\)]/gi;

const NOISE_WORDS_RE =
  /\b(?:480p|720p|1080p|2160p|4320p|4k|8k|hdtv|hdtvrip|bluray|blu[-.\s]?ray|brrip|brip|bdrip|hdrip|dvdscr|web[-.\s]?dl|webrip|dvdrip|amzn|netflix|esub|multi|avchd|x264[-.\s]?hdc|x264|x265|h\.?264|h\.?265|hevc|xvid|divx|av1|aac|aac5(?:[.\s_-]?1)?|ac3|dts[-.\s]?x|dtsx|dts[-.\s]?hd(?:ma)?|dtshd|dts|eac3|hdr10plus|hdr10|hdr|sdr|dd\+?5(?:[.\s_-]?1)?|ddp2(?:[.\s_-]?0)?|ddp5(?:[.\s_-]?1)?|6ch|8ch|5[.\s_-]?1ch|5[.\s_-]?1|7[.\s_-]?1|uhd|ultrahd|truehd|remux|hddvd|audio|eng|10bit|imax|atmos|sd|hd|mp3|repack|proper|extended|theatrical|remastered|unrated|yify|rarbg)\b/gi;

const LEADING_NUM_RE = /^\d{1,3}[.\s]+/;

defineRouteMeta({
  openAPI: {
    tags: ["Cover Art"],
    summary: "Look up movie/TV poster via TMDB or TVDB",
    parameters: [
      { name: "title", in: "query", required: true, schema: { type: "string" } },
      { name: "year", in: "query", schema: { type: "string" } },
      { name: "type", in: "query", schema: { type: "string", enum: ["movie", "tv"] } },
    ],
    responses: {
      200: { description: "Poster URL or null" },
    },
  },
});

// ── Constants ───────────────────────────────────────────────────────────────

const TMDB_BASE = "https://api.themoviedb.org/3";
const POSTER_W185 = "https://image.tmdb.org/t/p/w185";

const TVDB_BASE = "https://api4.thetvdb.com/v4";

// ── API key helpers ─────────────────────────────────────────────────────────

function getTmdbKey(): string | null {
  const db = getConfig("tmdb_api_key");
  if (db?.trim()) return db.trim();
  if (process.env.TMDB_API_KEY?.trim()) return process.env.TMDB_API_KEY.trim();
  return null;
}

function getTvdbKey(): string | null {
  const db = getConfig("tvdb_api_key");
  if (db?.trim()) return db.trim();
  if (process.env.TVDB_API_KEY?.trim()) return process.env.TVDB_API_KEY.trim();
  return null;
}

// ── TVDB token cache ────────────────────────────────────────────────────────

let _tvdbToken: string | null = null;
let _tvdbTokenExpiry = 0;
let _tvdbTokenForKey = "";

async function getTvdbToken(): Promise<string | null> {
  const apiKey = getTvdbKey();
  if (!apiKey) return null;
  const now = Date.now();
  if (_tvdbToken && now < _tvdbTokenExpiry && _tvdbTokenForKey === apiKey) return _tvdbToken;
  _tvdbToken = null;
  try {
    const res = await fetch(`${TVDB_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { data } = await res.json() as { data: { token: string } };
    _tvdbToken = data?.token ?? null;
    _tvdbTokenExpiry = now + 23 * 60 * 60 * 1000;
    _tvdbTokenForKey = apiKey;
    return _tvdbToken;
  } catch {
    return null;
  }
}

// ── Title cleaning (mirrors smart-rename's normalizeStem + buildLookupQuery) ─

function cleanSearchTitle(raw: string): string[] {
  // Strip extension
  const lastDot = raw.lastIndexOf(".");
  const stem = lastDot !== -1 ? raw.slice(0, lastDot) : raw;

  // normalizeStem logic
  const normalized = stem
    .replace(/[._]+/g, " ")
    .replace(/,/g, " ")
    .replace(/-/g, " ")
    .replace(NOISE_TAGS_RE, " ")
    .replace(/[\[\](){}]/g, " ")
    .replace(NOISE_WORDS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  // Build candidates: full cleaned + without leading numbers
  const candidates = [normalized];
  const withoutNum = normalized.replace(LEADING_NUM_RE, "").trim();
  if (withoutNum && withoutNum !== normalized) candidates.push(withoutNum);

  // Deduplicate
  return [...new Set(candidates)];
}

// ── Match validation ────────────────────────────────────────────────────────

function wordsOverlap(query: string, matchTitle: string): boolean {
  const qWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const mWords = matchTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return qWords.some((w) => mWords.includes(w));
}

// ── Response types ──────────────────────────────────────────────────────────

interface CoverMatch {
  id?: number | string;
  title?: string;
  year?: string;
  overview?: string;
  rating?: number;
  genres?: string[];
  runtime?: number;
  director?: string;
  cast?: string[];
}

interface CoverResult {
  poster: string | null;
  source: string | null;
  searchTitle: string;
  rawQuery: string;
  confidence: "high" | "low" | "none";
  match: CoverMatch | null;
}

// ── Poster URL builders ──────────────────────────────────────────────────────

function tmdbPoster(path: string): string {
  return `${POSTER_W185}${path}`;
}

function tvdbPoster(path: string): string {
  return path.startsWith("http") ? path : `https://artworks.thetvdb.com${path}`;
}

// ── TMDB detail + credits fetch ───────────────────────────────────────────────

async function fetchTmdbDetails(
  id: number,
  mediaType: "movie" | "tv",
): Promise<{
  rating?: number;
  genres?: string[];
  runtime?: number;
  overview?: string;
  year?: string;
  title?: string;
}> {
  const tmdbKey = getTmdbKey();
  if (!tmdbKey) return {};
  try {
    const res = await fetch(
      `${TMDB_BASE}/${mediaType}/${id}?api_key=${tmdbKey}&language=en-US`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return {};
    const data: any = await res.json();
    return {
      rating: data.vote_average ? Math.round(data.vote_average * 10) / 10 : undefined,
      genres: data.genres?.map((g: any) => g.name),
      runtime: mediaType === "movie" ? data.runtime : data.episode_run_time?.[0],
      overview: data.overview?.slice(0, 300),
      year: (data.release_date ?? data.first_air_date ?? "").slice(0, 4),
      title: data.title ?? data.name,
    };
  } catch {
    return {};
  }
}

async function fetchTmdbCredits(
  id: number,
  mediaType: "movie" | "tv",
): Promise<{ director?: string; cast?: string[] }> {
  const tmdbKey = getTmdbKey();
  if (!tmdbKey) return {};
  try {
    const res = await fetch(
      `${TMDB_BASE}/${mediaType}/${id}/credits?api_key=${tmdbKey}&language=en-US`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return {};
    const data: any = await res.json();
    const director = data.crew?.find((c: any) => c.job === "Director")?.name;
    const cast = data.cast?.slice(0, 4).map((c: any) => c.name);
    return { director, cast };
  } catch {
    return {};
  }
}

// ── TMDB search ─────────────────────────────────────────────────────────────

async function searchTmdb(
  query: string,
  year?: string,
  type?: string,
): Promise<CoverResult | null> {
  const tmdbKey = getTmdbKey();
  if (!tmdbKey) return null;

  const types = type === "tv" ? ["tv", "movie"] : ["movie", "tv"];
  for (const mediaType of types) {
    const params = new URLSearchParams({ api_key: tmdbKey, query });
    if (year) params.set("year", String(year));
    try {
      const res = await fetch(`${TMDB_BASE}/search/${mediaType}?${params}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const result = data?.results?.[0];
      if (result?.poster_path) {
        // Fetch details and credits in parallel (fire-and-forget style)
        const detailsPromise = fetchTmdbDetails(result.id, mediaType as "movie" | "tv");
        const creditsPromise = fetchTmdbCredits(result.id, mediaType as "movie" | "tv");
        const [details, credits] = await Promise.all([detailsPromise, creditsPromise]);

        return {
          poster: tmdbPoster(result.poster_path),
          source: "tmdb",
          searchTitle: query,
          rawQuery: query,
          confidence: "high",
          match: {
            id: result.id,
            title: details.title ?? result.title ?? result.name,
            year: details.year ?? (result.release_date ?? result.first_air_date ?? "").slice(0, 4),
            overview: details.overview ?? result.overview?.slice(0, 200),
            rating: details.rating,
            genres: details.genres,
            runtime: details.runtime,
            director: credits.director,
            cast: credits.cast,
          },
        };
      }
    } catch { /* skip */ }
  }
  return null;
}

// ── TVDB search ─────────────────────────────────────────────────────────────

async function searchTvdb(
  query: string,
  year?: string,
  type?: string,
): Promise<CoverResult | null> {
  const tvdbKey = getTvdbKey();
  if (!tvdbKey) return null;

  const token = await getTvdbToken();
  if (!token) return null;

  const mediaTypes = type === "movie" ? ["movie", "series"] : ["series", "movie"];
  for (const mediaType of mediaTypes) {
    const params = new URLSearchParams({ q: query });
    if (year) params.set("year", String(year));

    const endpoint = mediaType === "movie" ? "movies" : "series";
    try {
      const res = await fetch(`${TVDB_BASE}/${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const result = data?.data?.[0];
      if (!result) continue;

      // Skip known false positive: TVDB often returns Buffy the Vampire Slayer
      // (id 70327) for polluted/noisy filenames — it's never the right match.
      if (result.id === 70327) continue;

      // Try direct image first
      if (result?.image) {
        return {
          poster: tvdbPoster(result.image),
          source: "tvdb",
          searchTitle: query,
          rawQuery: query,
          confidence: "high",
          match: {
            id: result.id,
            title: result.name ?? result.title,
            year: result.year ?? (result.releaseDate ?? "").slice(0, 4),
          },
        };
      }

      // Fetch artworks
      if (result?.id) {
        const artRes = await fetch(`${TVDB_BASE}/${endpoint}/${result.id}/artworks`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (artRes.ok) {
          const artData: any = await artRes.json();
          const poster = artData?.data?.posters?.[0]?.image
            ?? artData?.data?.posters?.[0]?.fileName;
          if (poster) {
            return {
              poster: tvdbPoster(poster),
              source: "tvdb",
              searchTitle: query,
              rawQuery: query,
              confidence: "high",
              match: {
                id: result.id,
                title: result.name ?? result.title,
                year: result.year ?? (result.releaseDate ?? "").slice(0, 4),
              },
            };
          }
        }
      }
    } catch { /* skip */ }
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { title, year, type } = getQuery(event);
  if (!title || typeof title !== "string" || !title.trim()) {
    return { poster: null, source: null, searchTitle: null, rawQuery: null, confidence: "none", match: null } satisfies CoverResult;
  }

  const rawQuery = title.trim();

  // ── Clean the title ───────────────────────────────────────────────────
  const candidates = cleanSearchTitle(rawQuery);
  if (candidates.length === 0) {
    return { poster: null, source: null, searchTitle: rawQuery, rawQuery, confidence: "none", match: null } satisfies CoverResult;
  }

  // Try each candidate against each available provider
  const hasTmdb = !!getTmdbKey();
  const hasTvdb = !!getTvdbKey();

  for (const candidate of candidates) {
    // Call both providers in parallel for maximum coverage
    const [tmdbResult, tvdbResult] = await Promise.all([
      hasTmdb ? searchTmdb(candidate, year as string, type as string) : null,
      hasTvdb ? searchTvdb(candidate, year as string, type as string) : null,
    ]);

    // Prefer TMDB — it has richer data (rating, genres, runtime, director, cast)
    if (tmdbResult) {
      return { ...tmdbResult, rawQuery } satisfies CoverResult;
    }

    // Fallback to TVDB with word-overlap validation
    if (tvdbResult) {
      if (wordsOverlap(candidate, tvdbResult.match?.title ?? "")) {
        return { ...tvdbResult, rawQuery } satisfies CoverResult;
      }
      // TVDB without word overlap is unreliable → try next candidate
      continue;
    }
  }

  // ── No result from any provider ─────────────────────────────────────────

  return {
    poster: null,
    source: null,
    searchTitle: candidates[0],
    rawQuery,
    confidence: "none",
    match: null,
  } satisfies CoverResult;
});
