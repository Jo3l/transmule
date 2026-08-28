/**
 * TMDB service — cliente para The Movie Database API con cache en SQLite.
 *
 * Endpoints usados:
 *   GET /3/search/movie?query=&year=          → búsqueda de películas
 *   GET /3/search/tv?query=&first_air_date_year= → búsqueda de series
 *   GET /3/movie/{id}?append_to_response=   → detalle de película
 *   GET /3/tv/{id}?append_to_response=      → detalle de serie
 *   GET /3/movie/{id}/release_dates         → fechas de estreno (Digital = type 4)
 *   GET /3/tv/{id}/season/{n}/episode/{m}   → detalle de episodio (para calendar)
 *
 * Las claves se leen de getConfig("tmdb_api_key") o env TMDB_API_KEY.
 * La caché usa la tabla planner_metadata_cache (SQLite).
 */

import { getConfig } from "~/utils/database";
import { getMetadataCache, setMetadataCache } from "~/utils/planner-db";

const TMDB_BASE = "https://api.themoviedb.org/3";
const POSTER_W500 = "https://image.tmdb.org/t/p/w500";
const POSTER_W185 = "https://image.tmdb.org/t/p/w185";

export interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  overview: string | null;
  release_date: string | null;
  poster_path: string | null;
  poster_url: string | null;
  vote_average: number | null;
  genre_ids: number[];
  media_type: "movie" | "tv";
}

export interface TmdbMovieDetail {
  id: number;
  title: string;
  original_title: string;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
  vote_average: number | null;
  genres: string[];
  poster_path: string | null;
  poster_url: string | null;
  imdb_id: string | null;
}

export interface TmdbReleaseDate {
  /** ISO date (yyyy-mm-dd) for the digital release (type 4), or null */
  digital: string | null;
  /** ISO date for theatrical (type 3), or null */
  theatrical: string | null;
}

export interface TmdbSeasonEpisode {
  season_number: number;
  episode_number: number;
  name: string | null;
  air_date: string | null;
  runtime: number | null;
  overview: string | null;
}

// ─── Key helper ─────────────────────────────────────────────────────────────

function getTmdbKey(): string | null {
  const db = getConfig("tmdb_api_key");
  if (db?.trim()) return db.trim();
  if (process.env.TMDB_API_KEY?.trim()) return process.env.TMDB_API_KEY.trim();
  return null;
}

function posterUrl(path: string | null, size: "w185" | "w500" = "w500"): string | null {
  if (!path) return null;
  return `${size === "w185" ? POSTER_W185 : POSTER_W500}${path}`;
}

function tmdbLocale(): string {
  const db = getConfig("tmdb_locale");
  if (db?.trim()) return db.trim();
  return "en-US";
}

// ─── Low-level fetch with cache ─────────────────────────────────────────────

async function tmdbFetch<T>(
  path: string,
  opts: { ttlSeconds?: number; noCache?: boolean; language?: string } = {},
): Promise<T | null> {
  const apiKey = getTmdbKey();
  if (!apiKey) throw new Error("TMDB API key not configured");

  const { ttlSeconds = 12 * 60 * 60, noCache = false, language } = opts;
  const lang = language ?? tmdbLocale();
  // La clave de caché incluye el idioma para no colisionar entre idiomas.
  const cachePath = `${path}&__lang=${lang}`;

  // Cache hit
  if (!noCache) {
    const cached = getMetadataCache("tmdb", cachePath, "fetch");
    if (cached) return JSON.parse(cached.payload_json) as T;
  }

  const url = `${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${apiKey}&language=${lang}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    if (res.status === 401) throw new Error("TMDB API key rejected (401)");
    if (res.status === 404) return null;
    if (res.status === 429) throw new Error("TMDB rate limit (429)");
    throw new Error(`TMDB error ${res.status}`);
  }
  const data = (await res.json()) as T;
  if (!noCache) {
    setMetadataCache("tmdb", cachePath, "fetch", JSON.stringify(data), ttlSeconds);
  }
  return data;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchTmdb(
  query: string,
  opts: { type?: "movie" | "tv"; year?: number; page?: number } = {},
): Promise<TmdbSearchResult[]> {
  const mediaType = opts.type ?? "movie";
  const params = new URLSearchParams({ query });
  if (opts.year) {
    params.set(mediaType === "movie" ? "year" : "first_air_date_year", String(opts.year));
  }
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));

  const data = await tmdbFetch<{ results: any[] }>(
    `/search/${mediaType}?${params.toString()}`,
    { ttlSeconds: 6 * 60 * 60 },
  );
  if (!data?.results) return [];

  return data.results.map((r) => ({
    id: r.id,
    title: r.title ?? r.name ?? "",
    original_title: r.original_title ?? r.original_name ?? "",
    overview: r.overview ?? null,
    release_date: r.release_date ?? r.first_air_date ?? null,
    poster_path: r.poster_path ?? null,
    poster_url: posterUrl(r.poster_path, "w185"),
    vote_average: r.vote_average ?? null,
    genre_ids: r.genre_ids ?? [],
    media_type: mediaType,
  }));
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export async function getTmdbMovieDetail(id: number, language?: string): Promise<TmdbMovieDetail | null> {
  const data = await tmdbFetch<any>(`/movie/${id}`, { language });
  if (!data) return null;
  return {
    id: data.id,
    title: data.title ?? "",
    original_title: data.original_title ?? "",
    overview: data.overview ?? null,
    release_date: data.release_date ?? null,
    runtime: data.runtime ?? null,
    vote_average: data.vote_average ?? null,
    genres: (data.genres ?? []).map((g: any) => g.name),
    poster_path: data.poster_path ?? null,
    poster_url: posterUrl(data.poster_path),
    imdb_id: data.imdb_id ?? null,
  };
}

/**
 * Idiomas en los que TMDB tiene la película traducida (título/sinopsis).
 * Alimenta el selector de idioma al añadir una película.
 */
export async function getTmdbMovieTranslations(
  id: number,
): Promise<{ code: string; name: string }[]> {
  const data = await tmdbFetch<any>(`/movie/${id}/translations`);
  if (!Array.isArray(data?.translations)) return [];
  return data.translations
    .filter((t: any) => t?.iso_639_1)
    .map((t: any) => ({
      code: t.iso_639_1,
      name: t.english_name ?? t.name ?? t.iso_639_1,
    }));
}

/**
 * Título localizado de la película en el idioma dado (o null si es igual al
 * original / no hay traducción). Usado por el scoring de búsqueda.
 */
export async function getTmdbMovieLocalizedTitle(
  id: number,
  isoLang: string,
): Promise<string | null> {
  if (!isoLang || isoLang === "en") return null;
  const detail = await getTmdbMovieDetail(id, isoLang).catch(() => null);
  if (!detail) return null;
  const localized = detail.title?.trim();
  const original = detail.original_title?.trim();
  if (!localized) return null;
  if (original && localized.toLowerCase() === original.toLowerCase()) return null;
  return localized;
}

/**
 * Título localizado de la SERIE en el idioma dado (o null si es igual al
 * original / no hay traducción). Usado por el scoring de búsqueda para series
 * añadidas por TMDB (sin tvdb_id, p.ej. desde el calendario).
 */
export async function getTmdbTvLocalizedName(
  id: number,
  isoLang: string,
): Promise<string | null> {
  if (!isoLang || isoLang === "en") return null;
  const data = await tmdbFetch<any>(`/tv/${id}`, { language: isoLang }).catch(() => null);
  if (!data) return null;
  const localized = data.name?.trim();
  const original = data.original_name?.trim();
  if (!localized) return null;
  if (original && localized.toLowerCase() === original.toLowerCase()) return null;
  return localized;
}

export async function getTmdbTvDetail(
  id: number,
): Promise<{ id: number; name: string; overview: string | null; first_air_date: string | null; poster_url: string | null; status: string | null } | null> {
  const data = await tmdbFetch<any>(`/tv/${id}`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name ?? "",
    overview: data.overview ?? null,
    first_air_date: data.first_air_date ?? null,
    poster_url: posterUrl(data.poster_path),
    status: data.status ?? null,
  };
}

// ─── Release dates (Digital = type 4) ───────────────────────────────────────

export async function getTmdbMovieReleaseDates(id: number): Promise<TmdbReleaseDate> {
  const data = await tmdbFetch<any>(`/movie/${id}/release_dates`);
  if (!data?.results) return { digital: null, theatrical: null };

  let digital: string | null = null;
  let theatrical: string | null = null;

  // Prefer US (or the configured locale region) if available
  const locale = tmdbLocale().toUpperCase().split("-")[1] ?? "US";
  const sorted = [...data.results].sort((a, b) => {
    const aMatch = a.iso_3166_1 === locale ? 0 : 1;
    const bMatch = b.iso_3166_1 === locale ? 0 : 1;
    return aMatch - bMatch;
  });

  for (const country of sorted) {
    for (const r of country.release_dates ?? []) {
      if (r.type === 4 && !digital) digital = r.release_date?.slice(0, 10) ?? null;
      if (r.type === 3 && !theatrical) theatrical = r.release_date?.slice(0, 10) ?? null;
    }
    if (digital && theatrical) break;
  }

  return { digital, theatrical };
}

// ─── Season / episode listing (for series calendar) ─────────────────────────

export async function getTmdbTvEpisodes(
  id: number,
  seasonNumber: number,
  language?: string,
): Promise<TmdbSeasonEpisode[]> {
  const data = await tmdbFetch<any>(`/tv/${id}/season/${seasonNumber}`, { language });
  if (!data?.episodes) return [];
  return data.episodes.map((e: any) => ({
    season_number: e.season_number,
    episode_number: e.episode_number,
    name: e.name ?? null,
    air_date: e.air_date ?? null,
    runtime: e.runtime ?? null,
    overview: e.overview ?? null,
  }));
}

/**
 * Todos los episodios de una serie TMDB (todas las temporadas).
 * Usado cuando una serie se añade desde TMDB (sin tvdb_id).
 */
export async function getAllTmdbTvEpisodes(
  id: number,
  language?: string,
): Promise<TmdbSeasonEpisode[]> {
  const detail = await getTmdbTvDetail(id);
  if (!detail) return [];

  // Número de temporadas (excluir season 0 = especiales si no hay episodios)
  const seasons: number[] = [];
  const data = await tmdbFetch<any>(`/tv/${id}`, { ttlSeconds: 12 * 60 * 60, language });
  const seasonList = (data?.seasons ?? []) as any[];
  for (const s of seasonList) {
    if (s.season_number > 0 && s.episode_count > 0) seasons.push(s.season_number);
  }

  const all: TmdbSeasonEpisode[] = [];
  for (const seasonNumber of seasons) {
    const eps = await getTmdbTvEpisodes(id, seasonNumber, language);
    all.push(...eps);
  }
  return all;
}

// ─── Monthly discovery (calendar) ───────────────────────────────────────────

export interface TmdbDiscoverItem {
  id: number;
  title: string;
  /** Fecha relevante: release_date (movie) o first_air_date/next_episode (tv) */
  date: string | null;
  media_type: "movie" | "tv";
  poster_url: string | null;
  vote_average: number | null;
}

/**
 * Películas con fecha de estreno (primary_release_date) dentro de [from, to].
 * Usa /discover/movie con sort por fecha.
 */
export async function discoverTmdbMoviesInRange(
  from: string,
  to: string,
): Promise<TmdbDiscoverItem[]> {
  const params = new URLSearchParams({
    "primary_release_date.gte": from,
    "primary_release_date.lte": to,
    sort_by: "primary_release_date.asc",
    with_release_type: "2|3", // theatrical limited + theatrical
  });
  const data = await tmdbFetch<any>(`/discover/movie?${params.toString()}`, {
    ttlSeconds: 6 * 60 * 60,
  }).catch(() => null);
  if (!data?.results) return [];
  return data.results.map((r: any) => ({
    id: r.id,
    title: r.title ?? r.name ?? "",
    date: r.release_date ?? null,
    media_type: "movie" as const,
    poster_url: posterUrl(r.poster_path, "w185"),
    vote_average: r.vote_average ?? null,
  }));
}

/**
 * Series con episodio al aire dentro de [from, to].
 * /discover/tv con air_date.gte/lte devuelve shows cuyo próximo episodio cae en el rango.
 */
export async function discoverTmdbTvInRange(
  from: string,
  to: string,
): Promise<TmdbDiscoverItem[]> {
  const params = new URLSearchParams({
    "air_date.gte": from,
    "air_date.lte": to,
    sort_by: "first_air_date.asc",
    with_status: "0|2", // returning series
  });
  const data = await tmdbFetch<any>(`/discover/tv?${params.toString()}`, {
    ttlSeconds: 6 * 60 * 60,
  }).catch(() => null);
  if (!data?.results) return [];
  return data.results.map((r: any) => ({
    id: r.id,
    title: r.name ?? r.title ?? "",
    date: r.next_episode_to_air?.air_date ?? r.first_air_date ?? null,
    media_type: "tv" as const,
    poster_url: posterUrl(r.poster_path, "w185"),
    vote_average: r.vote_average ?? null,
  }));
}

export { getTmdbKey };
