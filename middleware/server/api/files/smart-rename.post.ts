import path from "path";
import {
  defineEventHandler,
  readBody,
  createError,
  getCookie,
  getHeader,
} from "h3";
import type { H3Event } from "h3";
import { getDownloadsRoot, resolveSafe } from "../../utils/files";

interface MediaResult {
  type: "tv" | "movie" | "unknown";
  name: string;
  season?: number;
  episode?: number;
  year?: number;
  extension: string;
}

interface SmartRenameProposal {
  source: "cleanup" | "tmdb" | "tvdb";
  suggested: string;
}

const TV_SE_REGEX = /^(?<name>.+?)\s+[Ss](?<season>\d+)[Ee](?<episode>\d+)/;
const TV_NxN_REGEX = /^(?<name>.+?)\s+(?<season>\d+)[xX](?<episode>\d+)/;
const TV_TE_REGEX = /^(?<name>.+?)\s+[Tt](?<season>\d+)[Ee](?<episode>\d+)/;
const TV_TEMPORADA_EP_REGEX =
  /^(?<name>.+?)\s+[Tt]emporada\s*(?<season>\d+).*?[Ee](?:pisodio|p)\s*(?<episode>\d+)/;
const TV_SPACE_SE_EP_REGEX =
  /^(?<name>.+?)\s+(?<season>\d{1,2})\s+(?<episode>\d{1,3})(?:\s|$)/;
const TV_EP_ONLY_REGEX =
  /(?:^|\s)[Ee](?:p(?:isode)?\s*)?(?<episode>\d{1,3})(?:\s|$)/i;
const DIR_SEASON_REGEX =
  /(?:^|\s)(?:season|temporada|s|t)\s*(?<season>\d{1,2})(?:\s|$)/i;
const TV_CAP_REGEX =
  /^(?<name>.+?)\s*[\[\(]?\s*[Cc]ap[.\s](?<cap>\d{2,4})\s*[\]\)]?/;

const MOVIE_YEAR_REGEX = /^(?<name>.+?)\s+(?<year>\d{4})(?:\s|$)/;
const MOVIE_LEADING_YEAR_REGEX =
  /^\(?(?<year>(?:19|20)\d{2})\)?\s+(?<name>.+)$/;

const NOISE_TAGS_RE =
  /\s*[\[\(][^\[\]()]*(?:720p|1080p|2160p|4K|HDTV|BluRay|WEB-DL|WEBRip|DVDRip|x264|x265|HEVC|AAC|AC3|H\.?264|H\.?265|XviD|DivX|HDR|SDR|REPACK|PROPER|EXTENDED|THEATRICAL|REMASTERED)[^\[\]()]*[\]\)]/gi;

const NOISE_WORDS_RE =
  /\b(?:480p|720p|1080p|2160p|4320p|4k|8k|hdtv|hdtvrip|bluray|blu[-\s]?ray|brrip|brip|bdrip|hdrip|dvdscr|web[-\s]?dl|webrip|dvdrip|amzn|netflix|esub|multi|avchd|x264[-\s]?hdc|x264|x265|h\.?264|h\.?265|hevc|xvid|divx|av1|aac|aac5(?:[.\s_-]?1)?|ac3|dts[-\s]?x|dtsx|dts[-\s]?hd(?:ma)?|dtshd|dts|eac3|hdr10plus|hdr10|hdr|sdr|dd\+?5(?:[.\s_-]?1)?|ddp2(?:[.\s_-]?0)?|ddp5(?:[.\s_-]?1)?|6ch|8ch|5[.\s_-]?1ch|5[.\s_-]?1|7[.\s_-]?1|uhd|ultrahd|truehd|remux|hddvd|audio|eng|10bit|imax|atmos|sd|hd|mp3|repack|proper|extended|theatrical|remastered|unrated|yify|rarbg)\b/gi;

const LOCALE_COOKIE_KEY = "sark-lang";

const TMDB_DEFAULT_REGION_BY_LANG: Record<string, string> = {
  en: "US",
  es: "ES",
  it: "IT",
  pt: "PT",
  fr: "FR",
  de: "DE",
  ja: "JP",
  ko: "KR",
  zh: "CN",
};

const TVDB_LANGUAGE_BY_LANG: Record<string, string> = {
  en: "eng",
  es: "spa",
  it: "ita",
  pt: "por",
  fr: "fra",
  de: "deu",
  ja: "jpn",
  ko: "kor",
  zh: "zho",
};

const SUPPORTED_PROVIDER_LANGUAGES = new Set(
  Object.keys(TVDB_LANGUAGE_BY_LANG),
);

function normalizeLocale(raw: string): string | null {
  const cleaned = raw.trim().replace(/_/g, "-").split(";")[0]?.trim() ?? "";
  if (!cleaned || cleaned === "*") return null;

  const parts = cleaned.split("-").filter(Boolean);
  if (parts.length === 0) return null;

  const language = parts[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(language)) return null;

  const region = parts.find(
    (p, idx) => idx > 0 && /^(?:[a-z]{2}|\d{3})$/i.test(p),
  );
  return region ? `${language}-${region.toUpperCase()}` : language;
}

function parseAcceptLanguage(headerValue?: string): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((chunk) => normalizeLocale(chunk))
    .filter((v): v is string => Boolean(v));
}

function getPreferredLocales(event: H3Event): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate?: string | null) => {
    if (!candidate) return;
    const normalized = normalizeLocale(candidate);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  const localeHeader = getHeader(event, "x-transmule-locale");
  if (typeof localeHeader === "string") {
    for (const chunk of localeHeader.split(",")) push(chunk);
  }

  push(getCookie(event, LOCALE_COOKIE_KEY));

  const acceptLanguageHeader = getHeader(event, "accept-language");
  if (typeof acceptLanguageHeader === "string") {
    for (const locale of parseAcceptLanguage(acceptLanguageHeader)) {
      push(locale);
    }
  }

  push("en");
  return out;
}

function buildProviderPreferredLocales(
  configuredLocale: string | null,
  requestLocales: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate?: string | null) => {
    if (!candidate) return;
    const normalized = normalizeLocale(candidate);
    if (!normalized) return;
    const language = normalized.split("-")[0]?.toLowerCase() ?? "";
    if (!SUPPORTED_PROVIDER_LANGUAGES.has(language)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  push(configuredLocale);
  for (const locale of requestLocales) push(locale);
  push("en");

  return out;
}

function toTmdbLanguage(locale: string): string {
  const [languageRaw, regionRaw] = locale.split("-");
  const language = languageRaw.toLowerCase();
  const region =
    regionRaw?.toUpperCase() ?? TMDB_DEFAULT_REGION_BY_LANG[language] ?? "";
  return region ? `${language}-${region}` : language;
}

function buildTmdbLanguageCandidates(locales: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate?: string) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate);
  };

  for (const locale of locales) {
    push(toTmdbLanguage(locale));
  }
  push("en-US");

  return out;
}

function toTvdbLanguage(locale: string): string {
  const language = locale.split("-")[0]?.toLowerCase() ?? "";
  return TVDB_LANGUAGE_BY_LANG[language] ?? language;
}

function buildTvdbLanguageCandidates(locales: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate?: string) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate);
  };

  for (const locale of locales) {
    push(toTvdbLanguage(locale));
  }
  push("eng");

  return out;
}

function normalizeStem(rawStem: string): string {
  return rawStem
    .replace(/[._]+/g, " ")
    .replace(/,/g, " ")
    .replace(/-/g, " ")
    .replace(NOISE_TAGS_RE, " ")
    .replace(/[\[\](){}]/g, " ")
    .replace(NOISE_WORDS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? name : name.slice(0, idx);
}

function parseTvNumbers(seasonRaw?: string, episodeRaw?: string) {
  if (!seasonRaw || !episodeRaw) return null;
  const season = parseInt(seasonRaw, 10);
  const episode = parseInt(episodeRaw, 10);
  if (isNaN(season) || isNaN(episode)) return null;
  if (season < 1 || season > 99 || episode < 1 || episode > 999) return null;
  return { season, episode };
}

function cleanMovieTitleCandidate(input: string): string {
  return input
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(
      /\b(?:castellano|latino|espa[nñ]ol|spanish|ingl[eé]s|english|subtitulado|subs?|dual|vose)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function pickLikelyMovieTitle(input: string): string {
  const chunks = input
    .split(/\s+-\s+|\s+\|\s+|\s+\/\s+/)
    .map((c) => cleanMovieTitleCandidate(c))
    .filter(Boolean);

  const candidates =
    chunks.length > 0 ? chunks : [cleanMovieTitleCandidate(input)];
  let best = candidates[0] ?? "";
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const words = candidate.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    let score = 0;

    if (wordCount >= 2 && wordCount <= 6) score += 3;
    else if (wordCount === 1 || wordCount === 7) score += 1;

    if (
      /\b(?:castellano|latino|subtitulado|subs?|dual|vose|x264|x265|1080p|720p|avi|mkv|mp4)\b/i.test(
        candidate,
      )
    ) {
      score -= 3;
    }
    if (/\d{4}/.test(candidate)) score -= 1;
    if (/,/.test(candidate)) score -= 2;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function buildLookupQuery(filename: string): string {
  const stem = stripExtension(filename);
  const cleaned = normalizeStem(cleanMovieTitleCandidate(stem));
  if (cleaned) return cleaned;
  return normalizeStem(stem);
}

function buildTmdbQueryCandidates(
  primary: string,
  fallback?: string,
): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const cleaned = normalizeStem(
      cleanMovieTitleCandidate(raw).replace(/[|/\\]+/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || cleaned.length < 2) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(cleaned);
  };

  const source = stripExtension(primary);
  push(source);

  const leadYear = MOVIE_LEADING_YEAR_REGEX.exec(source);
  if (leadYear?.groups?.name) push(leadYear.groups.name);

  for (const chunk of source.split(/\s+-\s+|\s+\|\s+|\s+\/\s+/)) {
    push(chunk);
  }

  // Many release names use '-' without spaces as a hard separator.
  // Ignore one-word chunks here to avoid false positives like "Ant" from "Ant-Man".
  const dashChunks = source.split(/-+/);
  if (dashChunks.length > 1) {
    for (const chunk of dashChunks) {
      const normalizedChunk = normalizeStem(cleanMovieTitleCandidate(chunk))
        .replace(/\s+/g, " ")
        .trim();
      if (!normalizedChunk) continue;

      const wordCount = normalizedChunk.split(/\s+/).filter(Boolean).length;
      if (wordCount < 2) continue;

      push(normalizedChunk);
    }
  }

  const words = source
    .replace(/[.,;:]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (let len = 8; len >= 2; len--) {
    if (words.length >= len) push(words.slice(0, len).join(" "));
  }

  if (fallback) push(stripExtension(fallback));
  return results.slice(0, 12);
}

function pickLocalizedFallbackTitle(
  sourceRaw: string,
  fallback: string,
): string {
  const candidates = buildTmdbQueryCandidates(sourceRaw, fallback);
  let best = pickLikelyMovieTitle(fallback);
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const normalized = pickLikelyMovieTitle(candidate);
    if (!normalized) continue;

    const words = normalized.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    let score = 0;

    if (wordCount >= 2 && wordCount <= 7) score += 4;
    else if (wordCount >= 8 && wordCount <= 10) score += 1;
    else score -= 2;

    if (/\b(?:19|20)\d{2}\b/.test(normalized)) score -= 2;
    if (hasSpanishHints(normalized)) score += 1;
    if (looksEnglishTitle(normalized)) score -= 1;

    // Penalize pure actor-like lists: "Kirk Douglas James Mason Paul Lukas".
    if (
      /^(?:[A-ZÁÉÍÓÚÑ][\p{L}'-]+\s+){2,}[A-ZÁÉÍÓÚÑ][\p{L}'-]+$/u.test(
        normalized,
      )
    ) {
      score -= 4;
    }

    if (score > bestScore) {
      bestScore = score;
      best = normalized;
    }
  }

  return best;
}

function compareTmdbTitleScore(
  query: string,
  title: string,
  expectedYear?: number,
  resultDate?: string,
): number {
  const q = query.toLowerCase();
  const t = title.toLowerCase();

  const qWords = new Set(q.split(/\s+/).filter((w) => w.length > 2));
  const tWords = new Set(t.split(/\s+/).filter((w) => w.length > 2));
  let overlap = 0;
  for (const w of qWords) {
    if (tWords.has(w)) overlap += 1;
  }

  const overlapScore = qWords.size > 0 ? overlap / qWords.size : 0;
  const containsScore = t.includes(q) || q.includes(t) ? 0.4 : 0;

  let yearScore = 0;
  if (expectedYear !== undefined && /^\d{4}/.test(resultDate ?? "")) {
    const y = parseInt((resultDate as string).slice(0, 4), 10);
    if (!isNaN(y) && y === expectedYear) yearScore = 0.6;
  }

  return overlapScore + containsScore + yearScore;
}

function titleTokenSet(value: string): Set<string> {
  const cleaned = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return new Set<string>();
  return new Set(cleaned.split(" ").filter((w) => w.length > 1));
}

function titleOverlapScore(a: string, b: string): number {
  const aTokens = titleTokenSet(a);
  const bTokens = titleTokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(aTokens.size, bTokens.size));
}

function hasSpanishHints(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[áéíóúñ]/i.test(text)) return true;
  return /\b(de|del|la|las|el|los|y|con|para|por)\b/.test(lower);
}

function looksEnglishTitle(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(the|and|of|in|to|for|from|with|without)\b/.test(lower);
}

function choosePreferredLocalizedTitle(
  providerTitle: string,
  fallbackTitle: string,
  preferredLocales: string[],
): string {
  const primaryLang = preferredLocales[0]?.split("-")[0]?.toLowerCase() ?? "en";
  if (primaryLang === "en") return providerTitle;

  const provider = providerTitle.trim();
  const fallback = fallbackTitle.trim();
  if (!provider || !fallback) return providerTitle;

  if (provider.toLowerCase() === fallback.toLowerCase()) return providerTitle;

  const overlap = titleOverlapScore(provider, fallback);
  if (overlap >= 0.6) return providerTitle;

  if (
    primaryLang === "es" &&
    hasSpanishHints(fallback) &&
    looksEnglishTitle(provider)
  ) {
    return fallback;
  }

  return providerTitle;
}

function parseLeadingYearMovie(
  rawStem: string,
  ext: string,
): MediaResult | null {
  const stemWithSpaces = rawStem
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = MOVIE_LEADING_YEAR_REGEX.exec(stemWithSpaces);
  if (!match?.groups) return null;

  const year = parseInt(match.groups.year, 10);
  if (isNaN(year) || year < 1888 || year > 2100) return null;

  const title = pickLikelyMovieTitle(match.groups.name);
  if (!title) return null;

  return {
    type: "movie",
    name: title,
    year,
    extension: ext,
  };
}

function extractLikelyYear(rawStem: string): number | undefined {
  const matches = [...rawStem.matchAll(/\b((?:19|20)\d{2})\b/g)];
  if (!matches.length) return undefined;

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const year = parseInt(matches[i][1], 10);
    if (!isNaN(year) && year >= 1888 && year <= 2100) return year;
  }

  return undefined;
}

function extractSeasonFromParentDir(relPath: string): number | undefined {
  const parentDirName = path.basename(path.dirname(relPath));
  if (!parentDirName || parentDirName === "." || parentDirName === "/")
    return undefined;

  const cleanParent = normalizeStem(parentDirName);
  const dirMatch = DIR_SEASON_REGEX.exec(cleanParent);
  if (dirMatch?.groups?.season) {
    const season = parseInt(dirMatch.groups.season, 10);
    if (!isNaN(season) && season >= 1 && season <= 99) return season;
  }

  if (/^\d{1,2}$/.test(cleanParent)) {
    const season = parseInt(cleanParent, 10);
    if (!isNaN(season) && season >= 1 && season <= 99) return season;
  }

  return undefined;
}

function parseName(relPath: string): MediaResult {
  const filename = path.basename(relPath);
  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot !== -1 ? filename.slice(lastDot + 1).toLowerCase() : "";
  const stem = lastDot !== -1 ? filename.slice(0, lastDot) : filename;
  const leadingYearMovie = parseLeadingYearMovie(stem, ext);
  if (leadingYearMovie) return leadingYearMovie;

  const cleanStem = normalizeStem(stem);
  const seasonFromDir = extractSeasonFromParentDir(relPath);

  const capMatch = TV_CAP_REGEX.exec(cleanStem);
  if (capMatch?.groups) {
    const cap = parseInt(capMatch.groups.cap, 10);
    if (!isNaN(cap)) {
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

  const tvSeMatch = TV_SE_REGEX.exec(cleanStem);
  if (tvSeMatch?.groups) {
    const season = parseInt(tvSeMatch.groups.season, 10);
    const episode = parseInt(tvSeMatch.groups.episode, 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return {
        type: "tv",
        name: tvSeMatch.groups.name.trim(),
        season,
        episode,
        extension: ext,
      };
    }
  }

  const tvNxNMatch = TV_NxN_REGEX.exec(cleanStem);
  if (tvNxNMatch?.groups) {
    const pair = parseTvNumbers(
      tvNxNMatch.groups.season,
      tvNxNMatch.groups.episode,
    );
    if (pair) {
      return {
        type: "tv",
        name: tvNxNMatch.groups.name.trim(),
        season: pair.season,
        episode: pair.episode,
        extension: ext,
      };
    }
  }

  const tvTeMatch = TV_TE_REGEX.exec(cleanStem);
  if (tvTeMatch?.groups) {
    const pair = parseTvNumbers(
      tvTeMatch.groups.season,
      tvTeMatch.groups.episode,
    );
    if (pair) {
      return {
        type: "tv",
        name: tvTeMatch.groups.name.trim(),
        season: pair.season,
        episode: pair.episode,
        extension: ext,
      };
    }
  }

  const tvTemporadaEpMatch = TV_TEMPORADA_EP_REGEX.exec(cleanStem);
  if (tvTemporadaEpMatch?.groups) {
    const pair = parseTvNumbers(
      tvTemporadaEpMatch.groups.season,
      tvTemporadaEpMatch.groups.episode,
    );
    if (pair) {
      return {
        type: "tv",
        name: tvTemporadaEpMatch.groups.name.trim(),
        season: pair.season,
        episode: pair.episode,
        extension: ext,
      };
    }
  }

  const tvSpaceMatch = TV_SPACE_SE_EP_REGEX.exec(cleanStem);
  if (tvSpaceMatch?.groups) {
    const pair = parseTvNumbers(
      tvSpaceMatch.groups.season,
      tvSpaceMatch.groups.episode,
    );
    if (pair && pair.season <= 30) {
      return {
        type: "tv",
        name: tvSpaceMatch.groups.name.trim(),
        season: pair.season,
        episode: pair.episode,
        extension: ext,
      };
    }
  }

  if (seasonFromDir !== undefined) {
    const epOnly = TV_EP_ONLY_REGEX.exec(cleanStem);
    if (epOnly?.groups?.episode) {
      const episode = parseInt(epOnly.groups.episode, 10);
      if (!isNaN(episode) && episode >= 1 && episode <= 999) {
        return {
          type: "tv",
          name: cleanStem,
          season: seasonFromDir,
          episode,
          extension: ext,
        };
      }
    }
  }

  const mvMatch = MOVIE_YEAR_REGEX.exec(cleanStem);
  if (mvMatch?.groups) {
    const year = parseInt(mvMatch.groups.year, 10);
    if (!isNaN(year) && year >= 1888 && year <= 2100) {
      return {
        type: "movie",
        name: pickLikelyMovieTitle(mvMatch.groups.name),
        year,
        extension: ext,
      };
    }
  }

  const inferredYear = extractLikelyYear(stem);
  if (inferredYear !== undefined && cleanStem) {
    return {
      type: "movie",
      name: pickLikelyMovieTitle(cleanStem),
      year: inferredYear,
      extension: ext,
    };
  }

  return { type: "unknown", name: cleanStem.trim(), extension: ext };
}

function buildSuggestedName(media: MediaResult): string {
  if (
    media.type === "tv" &&
    media.season !== undefined &&
    media.episode !== undefined
  ) {
    const s = String(media.season).padStart(2, "0");
    const e = String(media.episode).padStart(2, "0");
    const ext = media.extension ? `.${media.extension}` : "";
    return `${media.name} - s${s}e${e}${ext}`;
  }
  if (media.type === "movie" && media.year !== undefined) {
    const ext = media.extension ? `.${media.extension}` : "";
    return `${media.name} - ${media.year}${ext}`;
  }
  if (media.extension) return `${media.name}.${media.extension}`;
  return media.name;
}

function buildSuggestedNameWithTitle(
  media: MediaResult,
  title: string,
): string {
  return buildSuggestedName({ ...media, name: title });
}

function normalizeCleanupTitle(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .trim();

  if (!cleaned) return "";

  const lower = cleaned.toLocaleLowerCase();
  const firstWordCharIndex = lower.search(/[\p{L}\p{N}]/u);
  if (firstWordCharIndex === -1) return "";

  const first = lower[firstWordCharIndex];
  return (
    lower.slice(0, firstWordCharIndex) +
    first.toLocaleUpperCase() +
    lower.slice(firstWordCharIndex + 1)
  );
}

function buildCleanupSuggestedName(media: MediaResult): string {
  const normalizedTitle = normalizeCleanupTitle(media.name) || "File";
  const normalized = buildSuggestedName({
    ...media,
    name: normalizedTitle,
  })
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "");

  if (normalized) return normalized;
  if (media.extension) return `File.${media.extension}`;
  return "File";
}

function pushUniqueProposal(
  list: SmartRenameProposal[],
  source: SmartRenameProposal["source"],
  suggested: string,
) {
  const normalized = suggested.trim().toLowerCase();
  if (!normalized) return;
  if (list.some((p) => p.suggested.trim().toLowerCase() === normalized)) return;
  list.push({ source, suggested });
}

function getTmdbApiKey(): string | null {
  const dbKey = getConfig("tmdb_api_key");
  if (dbKey && dbKey.trim().length > 0) return dbKey.trim();
  const envKey = process.env.TMDB_API_KEY;
  if (envKey && envKey.trim().length > 0) return envKey.trim();
  return null;
}

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbSearchName(
  name: string,
  apiKey: string,
  type: "movie" | "tv",
  year?: number,
  sourceRaw?: string,
  preferredLocales: string[] = [],
): Promise<string | null> {
  const runSearch = async (
    query: string,
    language?: string,
    includeYear = false,
  ): Promise<string | null> => {
    const params = new URLSearchParams({
      api_key: apiKey,
      query,
      include_adult: "false",
    });
    if (language) params.set("language", language);
    if (type === "movie" && includeYear && year !== undefined) {
      params.set("year", String(year));
    }

    const res = await fetch(`${TMDB_BASE}/search/${type}?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const payload = (await res.json()) as {
      results?: Array<Record<string, unknown>>;
    };

    const rows = Array.isArray(payload?.results) ? payload.results : [];
    let bestName: string | null = null;
    let bestScore = -1;

    for (const row of rows) {
      const title =
        (typeof row.title === "string" && row.title.trim()) ||
        (typeof row.name === "string" && row.name.trim()) ||
        (typeof row.original_title === "string" && row.original_title.trim()) ||
        (typeof row.original_name === "string" && row.original_name.trim()) ||
        "";
      if (!title) continue;

      const date =
        (typeof row.release_date === "string" && row.release_date) ||
        (typeof row.first_air_date === "string" && row.first_air_date) ||
        "";

      const score = compareTmdbTitleScore(query, title, year, date);
      if (score > bestScore) {
        bestScore = score;
        bestName = title;
      }
    }

    return bestName;
  };

  try {
    const candidates = buildTmdbQueryCandidates(sourceRaw ?? name, name);
    const languageCandidates = buildTmdbLanguageCandidates(preferredLocales);

    for (const query of candidates) {
      for (const language of languageCandidates) {
        const byLocale = await runSearch(query, language, true);
        if (byLocale) return byLocale;

        if (year !== undefined) {
          const byLocaleNoYear = await runSearch(query, language, false);
          if (byLocaleNoYear) return byLocaleNoYear;
        }
      }

      const byDefault = await runSearch(query, undefined, year !== undefined);
      if (byDefault) return byDefault;

      if (year !== undefined) {
        const byDefaultNoYear = await runSearch(query, undefined, false);
        if (byDefaultNoYear) return byDefaultNoYear;
      }
    }

    return null;
  } catch {
    return null;
  }
}

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
let _tvdbTokenForKey = "";

async function getTvdbToken(): Promise<string | null> {
  const apiKey = getTvdbApiKey();
  if (!apiKey) return null;

  const now = Date.now();
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
    _tvdbTokenExpiry = now + 23 * 60 * 60 * 1000;
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
  year?: number,
  preferredLocales: string[] = [],
  sourceRaw?: string,
): Promise<string | null> {
  const normalize = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const parseTvdbEntityId = (row: Record<string, unknown>): string | null => {
    const raw = normalize(row.tvdb_id) || normalize(row.id);
    if (!raw) return null;
    const match = raw.match(/\d+/);
    return match?.[0] ?? null;
  };

  const findBestName = (
    rows: Array<Record<string, unknown>>,
  ): {
    name: string;
    tvdbId: string | null;
    hasTranslatedName: boolean;
  } | null => {
    const preferred = rows.filter(
      (row) => normalize(row.type).toLowerCase() === type,
    );
    for (const row of [...preferred, ...rows]) {
      const translatedName = normalize(row.name_translated);
      const candidate =
        translatedName || normalize(row.name) || normalize(row.title);
      if (candidate) {
        return {
          name: candidate,
          tvdbId: parseTvdbEntityId(row),
          hasTranslatedName: Boolean(translatedName),
        };
      }
    }
    return null;
  };

  const translationCache = new Map<string, string | null>();

  const fetchTranslatedName = async (
    tvdbId: string,
    language: string,
  ): Promise<string | null> => {
    if (!tvdbId || !language || language === "eng") return null;

    const cacheKey = `${type}:${tvdbId}:${language}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey) ?? null;
    }

    const collection = type === "movie" ? "movies" : "series";
    try {
      const res = await fetch(
        `${TVDB_BASE}/${collection}/${tvdbId}/translations/${language}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) {
        translationCache.set(cacheKey, null);
        return null;
      }

      const payload = (await res.json()) as {
        data?: Record<string, unknown>;
        name?: string;
      };
      const translated =
        normalize(payload?.data?.name) ||
        normalize(payload?.data?.title) ||
        normalize(payload?.name);
      const resolved = translated || null;
      translationCache.set(cacheKey, resolved);
      return resolved;
    } catch {
      translationCache.set(cacheKey, null);
      return null;
    }
  };

  const runSearch = async (
    query: string,
    includeYear: boolean,
    language?: string,
    acceptLanguage?: string,
  ): Promise<string | null> => {
    const params = new URLSearchParams({ query, q: query, type });
    if (includeYear && year !== undefined) params.set("year", String(year));
    if (language) params.set("language", language);

    const res = await fetch(`${TVDB_BASE}/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const payload = (await res.json()) as { data?: unknown };
    const rows = Array.isArray(payload?.data)
      ? (payload.data as Array<Record<string, unknown>>)
      : [];
    const best = findBestName(rows);
    if (!best) return null;

    if (
      language &&
      language !== "eng" &&
      best.tvdbId &&
      !best.hasTranslatedName
    ) {
      const translated = await fetchTranslatedName(best.tvdbId, language);
      if (translated) return translated;
    }

    return best.name;
  };

  try {
    const queryCandidates = buildTmdbQueryCandidates(sourceRaw ?? name, name);
    const languageCandidates = buildTvdbLanguageCandidates(preferredLocales);

    for (const query of queryCandidates) {
      for (let i = 0; i < languageCandidates.length; i += 1) {
        const language = languageCandidates[i];
        const acceptLanguage = preferredLocales[i] ?? preferredLocales[0];

        const localizedWithYear = await runSearch(
          query,
          true,
          language,
          acceptLanguage,
        );
        if (localizedWithYear) return localizedWithYear;

        if (year !== undefined) {
          const localizedNoYear = await runSearch(
            query,
            false,
            language,
            acceptLanguage,
          );
          if (localizedNoYear) return localizedNoYear;
        }
      }

      const withYear = await runSearch(query, true);
      if (withYear) return withYear;
      if (year !== undefined) {
        const withoutYear = await runSearch(query, false);
        if (withoutYear) return withoutYear;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function getSmartRenameSuggestion(
  relPath: string,
  opts: {
    tmdbPreferredLocales?: string[];
    tvdbPreferredLocales?: string[];
    includeCleanup?: boolean;
    includeIntegrations?: boolean;
  } = {},
) {
  const filename = path.basename(relPath);
  const stem = stripExtension(filename);
  const lookupQuery = buildLookupQuery(filename);
  const localeTitleFallback = pickLocalizedFallbackTitle(stem, lookupQuery);
  const tmdbPreferredLocales = opts.tmdbPreferredLocales ?? [];
  const tvdbPreferredLocales = opts.tvdbPreferredLocales ?? [];
  const includeCleanup = opts.includeCleanup !== false;
  const includeIntegrations = opts.includeIntegrations !== false;
  const media = parseName(relPath);

  const proposals: SmartRenameProposal[] = [];
  if (includeCleanup) {
    pushUniqueProposal(proposals, "cleanup", buildCleanupSuggestedName(media));
  }

  const tmdbApiKey = includeIntegrations ? getTmdbApiKey() : null;
  if (tmdbApiKey) {
    let tmdbName: string | null = null;
    if (media.type === "tv") {
      tmdbName = await tmdbSearchName(
        lookupQuery,
        tmdbApiKey,
        "tv",
        undefined,
        stem,
        tmdbPreferredLocales,
      );
    } else if (media.type === "movie") {
      tmdbName = await tmdbSearchName(
        lookupQuery,
        tmdbApiKey,
        "movie",
        media.year,
        stem,
        tmdbPreferredLocales,
      );
    } else {
      tmdbName =
        (await tmdbSearchName(
          lookupQuery,
          tmdbApiKey,
          "movie",
          undefined,
          stem,
          tmdbPreferredLocales,
        )) ??
        (await tmdbSearchName(
          lookupQuery,
          tmdbApiKey,
          "tv",
          undefined,
          stem,
          tmdbPreferredLocales,
        ));
    }
    if (tmdbName) {
      pushUniqueProposal(
        proposals,
        "tmdb",
        buildSuggestedNameWithTitle(media, tmdbName),
      );
    }
  }

  const tvdbToken = includeIntegrations ? await getTvdbToken() : null;
  if (tvdbToken) {
    let tvdbName: string | null = null;
    if (media.type === "tv") {
      tvdbName = await tvdbSearchName(
        lookupQuery,
        tvdbToken,
        "series",
        undefined,
        tvdbPreferredLocales,
        stem,
      );
    } else if (media.type === "movie") {
      tvdbName = await tvdbSearchName(
        lookupQuery,
        tvdbToken,
        "movie",
        media.year,
        tvdbPreferredLocales,
        stem,
      );
    } else {
      tvdbName =
        (await tvdbSearchName(
          lookupQuery,
          tvdbToken,
          "movie",
          undefined,
          tvdbPreferredLocales,
          stem,
        )) ??
        (await tvdbSearchName(
          lookupQuery,
          tvdbToken,
          "series",
          undefined,
          tvdbPreferredLocales,
          stem,
        ));
    }
    if (tvdbName) {
      const localizedTvdbName = choosePreferredLocalizedTitle(
        tvdbName,
        localeTitleFallback,
        tvdbPreferredLocales,
      );
      pushUniqueProposal(
        proposals,
        "tvdb",
        buildSuggestedNameWithTitle(media, localizedTvdbName),
      );
    }
  }

  return {
    originalPath: relPath,
    original: filename,
    suggested: proposals[0]?.suggested ?? buildSuggestedName(media),
    proposals,
    type: media.type,
  };
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const root = getDownloadsRoot();
  const requestPreferredLocales = getPreferredLocales(event);
  const tmdbPreferredLocales = buildProviderPreferredLocales(
    normalizeLocale(getConfig("tmdb_locale") ?? ""),
    requestPreferredLocales,
  );
  const tvdbPreferredLocales = buildProviderPreferredLocales(
    normalizeLocale(getConfig("tvdb_locale") ?? ""),
    requestPreferredLocales,
  );
  const body = await readBody<{
    paths: string[];
    includeCleanup?: boolean;
    includeIntegrations?: boolean;
  }>(event);

  const includeCleanup = body?.includeCleanup !== false;
  const includeIntegrations = body?.includeIntegrations !== false;

  if (!Array.isArray(body?.paths) || body.paths.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "paths must be a non-empty array",
    });
  }

  for (const p of body.paths) {
    resolveSafe(root, p);
  }

  const suggestions = await Promise.all(
    body.paths.map((relPath) =>
      getSmartRenameSuggestion(relPath, {
        tmdbPreferredLocales,
        tvdbPreferredLocales,
        includeCleanup,
        includeIntegrations,
      }),
    ),
  );

  return { suggestions };
});
