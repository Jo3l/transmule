/**
 * TVDB service — cliente para TheTVDB API v4 con cache en SQLite.
 *
 * Endpoints usados:
 *   POST /v4/login                              → obtener JWT
 *   GET  /v4/search?q=&type=series              → búsqueda de series
 *   GET  /v4/series/{id}                        → detalle de serie
 *   GET  /v4/series/{id}/episodes?season=N      → episodios de una temporada
 *
 * La clave se lee de getConfig("tvdb_api_key") o env TVDB_API_KEY.
 * El token JWT se cachea en memoria (expira ~24h, renovamos a las 23h).
 * La caché de respuestas usa planner_metadata_cache (SQLite).
 */

import { getConfig } from "~/utils/database";
import { getMetadataCache, setMetadataCache } from "~/utils/planner-db";

const TVDB_BASE = "https://api4.thetvdb.com/v4";

export interface TvdbSearchResult {
  id: number;
  name: string;
  first_air_time: string | null;
  year: string | null;
  image_url: string | null;
  overview: string | null;
  status: string | null;
}

export interface TvdbSeriesDetail {
  id: number;
  name: string;
  overview: string | null;
  firstAired: string | null;
  status: string | null;
  image: string | null;
  genres: string[];
  rating: number | null;
  runtime: number | null;
}

export interface TvdbEpisode {
  id: number;
  seasonNumber: number;
  number: number;
  name: string | null;
  airDate: string | null;
  runtime: number | null;
  overview: string | null;
  absoluteNumber: number | null;
}

// ─── Key + token helpers ────────────────────────────────────────────────────

function getTvdbKey(): string | null {
  const db = getConfig("tvdb_api_key");
  if (db?.trim()) return db.trim();
  if (process.env.TVDB_API_KEY?.trim()) return process.env.TVDB_API_KEY.trim();
  return null;
}

let _token: string | null = null;
let _tokenExpiry = 0;
let _tokenForKey = "";

async function getTvdbToken(): Promise<string | null> {
  const apiKey = getTvdbKey();
  if (!apiKey) return null;
  const now = Date.now();
  if (_token && now < _tokenExpiry && _tokenForKey === apiKey) return _token;
  _token = null;
  try {
    const res = await fetch(`${TVDB_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: { token: string } };
    _token = data?.token ?? null;
    _tokenExpiry = now + 23 * 60 * 60 * 1000;
    _tokenForKey = apiKey;
    return _token;
  } catch {
    return null;
  }
}

// ─── Low-level fetch with cache ─────────────────────────────────────────────

async function tvdbFetch<T>(
  path: string,
  opts: { ttlSeconds?: number; noCache?: boolean } = {},
): Promise<T | null> {
  const token = await getTvdbToken();
  if (!token) throw new Error("TVDB token not available");

  const { ttlSeconds = 12 * 60 * 60, noCache = false } = opts;

  if (!noCache) {
    const cached = getMetadataCache("tvdb", path, "fetch");
    if (cached) return JSON.parse(cached.payload_json) as T;
  }

  const res = await fetch(`${TVDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("TVDB token rejected (401)");
    if (res.status === 404) return null;
    if (res.status === 429) throw new Error("TVDB rate limit (429)");
    throw new Error(`TVDB error ${res.status}`);
  }
  const json = (await res.json()) as { data?: T };
  const data = json.data ?? (json as unknown as T);
  if (!noCache) {
    setMetadataCache("tvdb", path, "fetch", JSON.stringify(data), ttlSeconds);
  }
  return data;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchTvdb(
  query: string,
  opts: { year?: number; type?: "series" | "movie" } = {},
): Promise<TvdbSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (opts.year) params.set("year", String(opts.year));
  if (opts.type) params.set("type", opts.type);

  const data = await tvdbFetch<{ records?: any[] }>(`/search?${params.toString()}`, {
    ttlSeconds: 6 * 60 * 60,
  });
  const records = data && "records" in (data as any)
    ? (data as any).records
    : (data as any);
  if (!Array.isArray(records)) return [];

  return records
    .filter((r: any) => r.primary_type === "series" || !opts.type)
    .map((r: any) => ({
      // TVDB v4 search devuelve `id` como objectID string ("series-403245");
      // el id numérico real está en `tvdb_id` ("403245"). Extraemos el número
      // para no guardar "series-403245" en planner_subscriptions.tvdb_id.
      id: Number(String(r.tvdb_id ?? r.id ?? "").match(/(\d+)$/)?.[1] ?? 0),
      name: r.name ?? r.translations?.eng ?? "",
      first_air_time: r.first_air_time ?? null,
      year: r.year ?? null,
      image_url: r.image_url ?? null,
      overview: r.overview ?? null,
      status: r.status ?? null,
    }));
}

// ─── Series detail ──────────────────────────────────────────────────────────

export async function getTvdbSeriesDetail(id: number): Promise<TvdbSeriesDetail | null> {
  const data = await tvdbFetch<any>(`/series/${id}`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name ?? "",
    overview: data.overview ?? null,
    firstAired: data.firstAired ?? data.first_air_time ?? null,
    status: data.status?.name ?? data.status ?? null,
    image: data.image ?? null,
    genres: (data.genres ?? []).map((g: any) => g.name),
    rating: data.rating?.average ?? null,
    runtime: data.runtime ?? null,
  };
}

// ─── Episodes (season filter) ───────────────────────────────────────────────

export async function getTvdbSeriesEpisodes(
  id: number,
  seasonNumber?: number,
  language?: string,
): Promise<TvdbEpisode[]> {
  // TVDB v4 exige el segmento de ruta {season-type} (p. ej. "default").
  // Sin él, /series/{id}/episodes devuelve 400 Bad Request.
  // Con idioma: /series/{id}/episodes/{season-type}/{lang} devuelve los
  // episodios con el nombre traducido (fallback a inglés si no hay traducción).
  const tvdbLang = language && language !== "en" ? ISO_TO_TVDB_LANG[language] : undefined;
  const season = seasonNumber !== undefined ? `?season=${seasonNumber}` : "";
  const path = tvdbLang
    ? `/series/${id}/episodes/default/${tvdbLang}${season}`
    : `/series/${id}/episodes/default${season}`;
  const data = await tvdbFetch<any>(path, { ttlSeconds: 6 * 60 * 60 });
  // El endpoint traducido (/…/{lang}) devuelve { series: { episodes: [...] } };
  // el normal devuelve { episodes: [...] }.
  const episodes: any[] = Array.isArray(data?.episodes)
    ? data.episodes
    : Array.isArray(data?.series?.episodes)
      ? data.series.episodes
      : [];
  if (episodes.length === 0) return [];

  return episodes
    .filter((e: any) => e.seasonNumber !== 0) // skip specials
    .map((e: any) => ({
      id: e.id,
      seasonNumber: e.seasonNumber,
      number: e.number,
      name: e.name ?? null,
      // La API v4 llama al campo "aired" (no "airDate").
      airDate: e.aired ?? e.airDate ?? null,
      runtime: e.runtime ?? null,
      overview: e.overview ?? null,
      absoluteNumber: e.absoluteNumber ?? null,
    }));
}

/** Mapa ISO-639-1 (2 letras) → código TVDB (3 letras) para el endpoint de traducciones. */
const ISO_TO_TVDB_LANG: Record<string, string> = {
  en: "eng", es: "spa", it: "ita", pt: "por", fr: "fra", de: "deu",
  ru: "rus", ja: "jpn", ko: "kor", zh: "zho", nl: "nld", pl: "pol",
  sv: "swe", da: "dan", no: "nor", fi: "fin", cs: "ces", hu: "hun",
  ro: "ron", uk: "ukr", el: "ell", tr: "tur", th: "tha", vi: "vie",
  hi: "hin", ca: "cat", eu: "eus", gl: "glg", he: "heb", ar: "ara",
  fa: "fas", sr: "srp", hr: "hrv", bg: "bul", sl: "slv", sk: "slk",
  lt: "lit", lv: "lav", et: "est", is: "isl",
};

// ─── Translations (idiomas disponibles del nombre de la serie) ─────────────

export interface TvdbLanguage {
  /** Código ISO-639-1 (2 letras) que entiende el motor (es, en, it, ...). */
  code: string;
  /** Código de idioma TVDB (3 letras, p.ej. "spa"). */
  tvdb: string;
  /** Nombre legible del idioma (endónimo). */
  name: string;
}

/** TVDB usa códigos de 3 letras (ISO 639-2/B); el motor usa 2 (ISO 639-1). */
const TVDB_LANG_TO_ISO: Record<string, string> = {
  eng: "en", spa: "es", ita: "it", por: "pt", fra: "fr", fre: "fr",
  deu: "de", ger: "de", rus: "ru", jpn: "ja", kor: "ko", zho: "zh", chi: "zh",
  nld: "nl", dut: "nl", pol: "pl", swe: "sv", dan: "da", nor: "no",
  fin: "fi", ces: "cs", cze: "cs", hun: "hu", ron: "ro", rum: "ro",
  ukr: "uk", ell: "el", gre: "el", tur: "tr", tha: "th", vie: "vi",
  hin: "hi", cat: "ca", eus: "eu", baq: "eu", glg: "gl", lat: "la",
  pt: "pt", zhtw: "zh",
  heb: "he", ara: "ar", fas: "fa", per: "fa", srp: "sr", hrv: "hr",
  bul: "bg", slv: "sl", slk: "sk", slo: "sk", lit: "lt", lav: "lv", est: "et", isl: "is",
};

const ISO_LANG_NAMES: Record<string, string> = {
  en: "English", es: "Español", it: "Italiano", pt: "Português",
  fr: "Français", de: "Deutsch", ru: "Русский", ja: "日本語",
  ko: "한국어", zh: "中文", nl: "Nederlands", pl: "Polski",
  sv: "Svenska", da: "Dansk", no: "Norsk", fi: "Suomi",
  cs: "Čeština", hu: "Magyar", ro: "Română", uk: "Українська",
  el: "Ελληνικά", tr: "Türkçe", th: "ไทย", vi: "Tiếng Việt",
  hi: "हिन्दी", ca: "Català", eu: "Euskara", gl: "Galego", la: "Latina",
  he: "Hebrew", ar: "Arabic", fa: "Persian", sr: "Serbian", hr: "Croatian",
  bg: "Bulgarian", sl: "Slovenian", sk: "Slovak", lt: "Lithuanian", lv: "Latvian",
  et: "Estonian", is: "Icelandic",
};

/**
 * Devuelve los idiomas en los que TVDB tiene traducido el NOMBRE de la serie
 * (nameTranslations), normalizados al código ISO-2 que usa el motor. Útil para
 * poblar el selector de idioma del planificador al añadir una serie.
 */
export async function getTvdbSeriesTranslations(id: number): Promise<TvdbLanguage[]> {
  // TVDB v4: /series/{id}/translations/{lang} devuelve UNA sola traduccion
  // ({ name, overview, language, isPrimary }), NO la lista de idiomas. La lista
  // de idiomas con el nombre traducido vive en el detalle de la serie:
  // GET /series/{id} -> data.nameTranslations (array de codigos, p.ej. ["eng","spa"]).
  const data = await tvdbFetch<any>(`/series/${id}`, {
    ttlSeconds: 24 * 60 * 60,
  });
  const names = Array.isArray(data?.nameTranslations) ? data.nameTranslations : [];
  const seen = new Set<string>();
  const out: TvdbLanguage[] = [];
  for (const raw of names) {
    const rawCode = typeof raw === "string" ? raw : raw?.language;
    const tvdb = String(rawCode ?? "").toLowerCase();
    const code = tvdbCodeToIso(tvdb);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, tvdb, name: ISO_LANG_NAMES[code] ?? code });
  }
  return out;
}

/**
 * Devuelve el NOMBRE localizado de la serie en el idioma dado (o null si no hay
 * traducción). TVDB v4: /series/{id}/translations/{lang} → { name, ... }.
 * Usado por el scoring de búsqueda para no penalizar títulos localizados
 * (p.ej. "Juego de Tronos" para Game of Thrones).
 */
export async function getTvdbSeriesLocalizedName(
  id: number,
  isoLang: string,
): Promise<string | null> {
  const tvdbLang = ISO_TO_TVDB_LANG[isoLang];
  if (!tvdbLang) return null;
  const data = await tvdbFetch<any>(`/series/${id}/translations/${tvdbLang}`, {
    ttlSeconds: 24 * 60 * 60,
  }).catch(() => null);
  if (!data) return null;
  return typeof data?.name === "string" && data.name.trim() ? data.name : null;
}

/** Convierte un codigo de idioma TVDB (ISO 639-2/B de 3 letras, o 2 letras) a ISO-2. */
function tvdbCodeToIso(tvdb: string): string | null {
  if (tvdb.length === 2 && ISO_LANG_NAMES[tvdb]) return tvdb; // ya es ISO-2
  return TVDB_LANG_TO_ISO[tvdb] ?? null;
}

export { getTvdbKey };
