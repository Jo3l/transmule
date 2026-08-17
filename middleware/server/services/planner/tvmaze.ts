/**
 * TVmaze service — fuente de calendario de estrenos (gratis, sin API key).
 *
 * GET /schedule?date=YYYY-MM-DD&country=US  → TODOS los episodios de todas
 *   las series que emiten ese día. Esto es lo que Sonarr/Radarr usan de
 *   fondo (via TVDB) para su calendario: episodio por episodio, no un
 *   único "próximo episodio" por serie como /discover/tv de TMDB.
 *
 * Cada episodio incluye show.externals.tvdb → permite suscribirse a la
 * serie desde el calendario usando el tvdb_id real.
 *
 * Caché en planner_metadata_cache (TTL 6h por día).
 */

import { getMetadataCache, setMetadataCache } from "~/utils/planner-db";

const TVMAZE_BASE = "https://api.tvmaze.com";

export interface TvmazeEpisode {
  id: number;
  name: string | null;
  season: number;
  number: number | null;
  airdate: string | null; // YYYY-MM-DD
  airtime: string | null;
  runtime: number | null;
  show: {
    id: number;
    name: string;
    status: string | null;
    premiered: string | null;
    genres: string[];
    image: { medium: string | null; original: string | null } | null;
    /** La API de TVmaze expone `thetvdb` (no `tvdb`); `tvrage` también viene. */
    externals: { thetvdb: number | null; tvrage: number | null; imdb: string | null };
  };
}

/**
 * Normaliza filas de TVmaze a la forma canónica (show a nivel superior).
 * `/schedule` ya trae `ep.show`; `/schedule/web` lo anida en `ep._embedded.show`.
 * También repara datos cacheados con la forma antigua (web sin `show` top-level),
 * que de otra forma harían petar al consumidor con `ep.show.name`.
 */
function normalizeTvmazeEpisodes(eps: unknown): TvmazeEpisode[] {
  if (!Array.isArray(eps)) return [];
  const out: TvmazeEpisode[] = [];
  for (const raw of eps) {
    const ep = raw as Partial<TvmazeEpisode> & { _embedded?: { show?: TvmazeEpisode["show"] } };
    if (!ep || typeof ep !== "object") continue;
    const show = ep.show ?? ep._embedded?.show;
    if (!show) continue;
    out.push({ ...ep, show } as TvmazeEpisode);
  }
  return out;
}

/** Episodios de todas las series que emiten en una fecha concreta.
 *
 *  IMPORTANTE: se consultan DOS fuentes y se fusionan:
 *    - /schedule?date=X            → schedule internacional (TV tradicional)
 *    - /schedule/web?date=X        → series web/streaming (Apple TV+, Netflix, HBO…)
 *
 *  El filtro country=US excluía las series de streaming (ej. Silo), por eso
 *  se usa el schedule internacional sin filtro de país. */
export async function getTvmazeEpisodesForDate(date: string): Promise<TvmazeEpisode[]> {
  // Cache hit (6h — un día se emite una vez, pero el schedule puede retrasarse)
  const cached = getMetadataCache("tvmaze", date, "schedule");
  if (cached) {
    try {
      // Normalizar también la caché: entradas antiguas guardaban la forma
      // cruda de /schedule/web (show en _embedded, sin `show` top-level).
      return normalizeTvmazeEpisodes(JSON.parse(cached.payload_json));
    } catch {
      // cache corrupta → re-fetch
    }
  }

  const [tvRes, webRes] = await Promise.all([
    fetch(`${TVMAZE_BASE}/schedule?date=${date}`, { signal: AbortSignal.timeout(10000) }),
    fetch(`${TVMAZE_BASE}/schedule/web?date=${date}`, { signal: AbortSignal.timeout(10000) }),
  ]);

  if (!tvRes.ok && !webRes.ok) {
    if (tvRes.status === 429 || webRes.status === 429) throw new Error("TVmaze rate limit (429)");
    throw new Error(`TVmaze error ${tvRes.status || webRes.status}`);
  }

  const tvData = tvRes.ok ? normalizeTvmazeEpisodes(await tvRes.json()) : [];
  // /schedule/web anida el show en `_embedded.show` — lo normalizamos a `show`
  // para que el resto del código vea la misma forma que /schedule.
  const webData = webRes.ok ? normalizeTvmazeEpisodes(await webRes.json()) : [];

  // Fusionar y dedupe por id (un episodio puede aparecer en ambos)
  const seen = new Set<number>();
  const merged: TvmazeEpisode[] = [];
  for (const ep of [...tvData, ...webData]) {
    if (seen.has(ep.id)) continue;
    seen.add(ep.id);
    merged.push(ep);
  }

  setMetadataCache("tvmaze", date, "schedule", JSON.stringify(merged), 6 * 60 * 60);
  return merged;
}

/**
 * Episodios de todas las series en un rango [from, to] (inclusive).
 * Itera por día con caché — normalmente 1-31 llamadas, pero cada día se
 * cachea 6h así que solo se pide una vez por día.
 */
export async function getTvmazeEpisodesInRange(
  from: string,
  to: string,
): Promise<TvmazeEpisode[]> {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);

  const days: string[] = [];
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const all: TvmazeEpisode[] = [];
  for (const day of days) {
    const eps = await getTvmazeEpisodesForDate(day).catch(() => [] as TvmazeEpisode[]);
    all.push(...eps);
  }
  return all;
}
