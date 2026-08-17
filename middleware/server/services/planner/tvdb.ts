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
): Promise<TvdbEpisode[]> {
  // TVDB v4 exige el segmento de ruta {season-type} (p. ej. "default").
  // Sin él, /series/{id}/episodes devuelve 400 Bad Request.
  const path = seasonNumber !== undefined
    ? `/series/${id}/episodes/default?season=${seasonNumber}`
    : `/series/${id}/episodes/default`;
  const data = await tvdbFetch<any>(path, { ttlSeconds: 6 * 60 * 60 });
  if (!data?.episodes) return [];

  return data.episodes
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

export { getTvdbKey };
