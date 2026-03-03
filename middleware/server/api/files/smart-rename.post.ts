import path from "path";
import { defineEventHandler, readBody, createError } from "h3";
import { getDownloadsRoot, resolveSafe } from "../../utils/files";

// ── Media parsing (TypeScript port of lucabtz/media-renamer logic) ──────────

interface MediaResult {
  type: "tv" | "movie" | "unknown";
  name: string;
  season?: number;
  episode?: number;
  year?: number;
  extension: string;
}

// SxxExx  or  sxxexx
const TV_SE_REGEX = /^(?<name>.+?)\s+[Ss](?<season>\d+)[Ee](?<episode>\d+)/;
// NxNN  (e.g. 1x05)
const TV_NxN_REGEX = /^(?<name>.+?)\s+(?<season>\d+)[xX](?<episode>\d+)/;
// Cap.NNN or Cap NNN  (Spanish format: Cap.105 = s01e05, Cap.215 = s02e15)
const TV_CAP_REGEX = /^(?<name>.+?)\s*[\[\(]?\s*[Cc]ap[.\s](?<cap>\d{2,4})\s*[\]\)]?/;
// Year-only movie pattern
const MOVIE_YEAR_REGEX = /^(?<name>.+?)\s+(?<year>\d{4})(?:\s|$)/;

// Noise patterns to strip before matching (quality tags, source tags, etc.)
const NOISE_TAGS_RE =
  /\s*[\[\(][^\[\]()]*(?:720p|1080p|2160p|4K|HDTV|BluRay|WEB-DL|WEBRip|DVDRip|x264|x265|HEVC|AAC|AC3|H\.?264|H\.?265|XviD|DivX|HDR|SDR|REPACK|PROPER|EXTENDED|THEATRICAL|REMASTERED)[^\[\]()]*[\]\)]/gi;

/** Apply replacements and parse a filename stem into structured media data. */
function parseName(filename: string): MediaResult {
  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot !== -1 ? filename.slice(lastDot + 1).toLowerCase() : "";
  let stem = lastDot !== -1 ? filename.slice(0, lastDot) : filename;

  // Replace dots with spaces (default media-renamer replacement)
  stem = stem.replace(/\./g, " ").trim();

  // Try Cap.NNN pattern before stripping noise (the cap tag may be the only episode marker)
  const capMatch = TV_CAP_REGEX.exec(stem);
  if (capMatch?.groups) {
    const cap = parseInt(capMatch.groups.cap, 10);
    if (!isNaN(cap)) {
      // Cap.105 → s01e05  |  Cap.15 → s01e15  |  Cap.205 → s02e05
      let season: number;
      let episode: number;
      if (cap >= 100) {
        season = Math.floor(cap / 100);
        episode = cap % 100;
      } else {
        season = 1;
        episode = cap;
      }
      const rawName = capMatch.groups.name.replace(NOISE_TAGS_RE, "").trim();
      return { type: "tv", name: rawName, season, episode, extension: ext };
    }
  }

  // Strip noise tags before running the other patterns
  const cleanStem = stem.replace(NOISE_TAGS_RE, "").trim();

  // SxxExx
  const tvSeMatch = TV_SE_REGEX.exec(cleanStem);
  if (tvSeMatch?.groups) {
    const season = parseInt(tvSeMatch.groups.season, 10);
    const episode = parseInt(tvSeMatch.groups.episode, 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return { type: "tv", name: tvSeMatch.groups.name.trim(), season, episode, extension: ext };
    }
  }

  // NxNN
  const tvNxNMatch = TV_NxN_REGEX.exec(cleanStem);
  if (tvNxNMatch?.groups) {
    const season = parseInt(tvNxNMatch.groups.season, 10);
    const episode = parseInt(tvNxNMatch.groups.episode, 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return { type: "tv", name: tvNxNMatch.groups.name.trim(), season, episode, extension: ext };
    }
  }

  // Movie year
  const mvMatch = MOVIE_YEAR_REGEX.exec(cleanStem);
  if (mvMatch?.groups) {
    const year = parseInt(mvMatch.groups.year, 10);
    if (!isNaN(year) && year >= 1888 && year <= 2100) {
      return { type: "movie", name: mvMatch.groups.name.trim(), year, extension: ext };
    }
  }

  return { type: "unknown", name: cleanStem.trim(), extension: ext };
}

/** Build the Plex-style suggested filename (flat, not nested directory). */
function buildSuggestedName(media: MediaResult): string {
  if (media.type === "tv" && media.season !== undefined && media.episode !== undefined) {
    const s = String(media.season).padStart(2, "0");
    const e = String(media.episode).padStart(2, "0");
    const ext = media.extension ? `.${media.extension}` : "";
    return `${media.name} - s${s}e${e}${ext}`;
  }
  if (media.type === "movie" && media.year !== undefined) {
    const ext = media.extension ? `.${media.extension}` : "";
    return `${media.name} (${media.year})${ext}`;
  }
  if (media.extension) return `${media.name}.${media.extension}`;
  return media.name;
}

// ── TVDB API (optional enrichment) ──────────────────────────────────────────

/** Returns the configured TVDB API key, or null if not set. Priority: DB → env var. */
function getTvdbApiKey(): string | null {
  const dbKey = getConfig("tvdb_api_key");
  if (dbKey && dbKey.trim().length > 0) return dbKey.trim();
  const envKey = process.env.TVDB_API_KEY;
  if (envKey && envKey.trim().length > 0) return envKey.trim();
  return null;
}

const TVDB_BASE = "https://api4.thetvdb.com/v4";

let _tvdbToken: string | null = null;
let _tvdbTokenExpiry = 0;
let _tvdbTokenForKey = ""; // track which key the cached token belongs to

async function getTvdbToken(): Promise<string | null> {
  const apiKey = getTvdbApiKey();
  if (!apiKey) return null; // TVDB disabled — no key configured

  const now = Date.now();
  // Invalidate cache if the key changed
  if (_tvdbToken && now < _tvdbTokenExpiry && _tvdbTokenForKey === apiKey) {
    return _tvdbToken;
  }
  _tvdbToken = null;
  try {
    const res = await fetch(`${TVDB_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: { token: string } };
    _tvdbToken = data?.token ?? null;
    _tvdbTokenExpiry = now + 23 * 60 * 60 * 1000; // ~23 h
    _tvdbTokenForKey = apiKey;
    return _tvdbToken;
  } catch {
    return null;
  }
}

async function tvdbSearchName(
  name: string,
  token: string,
  type: "series" | "movie",
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ q: name, type });
    const res = await fetch(`${TVDB_BASE}/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: Array<{ name: string }> };
    return data?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const root = getDownloadsRoot();
  const body = await readBody<{ paths: string[] }>(event);

  if (!Array.isArray(body?.paths) || body.paths.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "paths must be a non-empty array" });
  }

  // Validate paths (security: no traversal)
  for (const p of body.paths) {
    resolveSafe(root, p);
  }

  // Get TVDB token (best-effort — failures are silently ignored)
  const tvdbToken = await getTvdbToken();

  const suggestions = await Promise.all(
    body.paths.map(async (relPath) => {
      const filename = path.basename(relPath);
      const media = parseName(filename);

      // Enrich with TVDB canonical name when possible
      if (tvdbToken && media.type !== "unknown") {
        const tvType = media.type === "tv" ? "series" : "movie";
        const betterName = await tvdbSearchName(media.name, tvdbToken, tvType);
        if (betterName) media.name = betterName;
      }

      return {
        originalPath: relPath,
        original: filename,
        suggested: buildSuggestedName(media),
        type: media.type,
      };
    }),
  );

  return { suggestions };
});
