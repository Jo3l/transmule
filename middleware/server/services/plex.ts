/**
 * Plex Media Server — integración (Settings → Integraciones).
 *
 * Las credenciales viven en la tabla `config` (getConfig/setConfig):
 *   plex_ip    — IP/host del servidor (o URL completa con http://)
 *   plex_port  — puerto (default 32400)
 *   plex_token — X-Plex-Token
 *
 * Usado por el planificador para:
 *   - Forzar un rescan de librerías tras una descarga (check plex_scan).
 *   - Listar títulos (películas/series) para marcar lo que ya existe en Plex.
 *
 * API (URL commands de Plex, https://support.plex.tv/articles/201638786):
 *   GET /library/sections                    → lista de librerías
 *   GET /library/sections/{key}/all?type=1|2 → items de una librería
 *   GET /library/sections/{key}/refresh      → forzar rescan
 */

import { getConfig } from "~/utils/database";

export interface PlexSection {
  key: string;
  title: string;
  type: string; // "movie" | "show" | "artist" | "photo" ...
}

export interface PlexCredentials {
  baseUrl: string;
  token: string;
}

export function getPlexCredentials(): PlexCredentials | null {
  const ip = (getConfig("plex_ip") ?? "").trim();
  const token = (getConfig("plex_token") ?? "").trim();
  if (!ip || !token) return null;
  const port = (getConfig("plex_port") ?? "").trim() || "32400";
  const baseUrl = ip.includes("://") ? ip.replace(/\/+$/, "") : `http://${ip}:${port}`;
  return { baseUrl, token };
}

async function plexFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<any> {
  const creds = getPlexCredentials();
  if (!creds) throw new Error("Plex no configurado");
  const res = await fetch(`${creds.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Plex-Token": creds.token,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Plex token rechazado (401)");
    throw new Error(`Plex error ${res.status}`);
  }
  // Algunos endpoints (p. ej. /refresh) responden XML o cuerpo vacío aunque
  // pidamos JSON — parseo tolerante y devuelvo null cuando no hay JSON.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function getPlexSections(): Promise<PlexSection[]> {
  const data = await plexFetch("/library/sections", {}, 8_000);
  const dirs = data?.MediaContainer?.Directory ?? [];
  return dirs.map((d: any) => ({
    key: String(d.key ?? ""),
    title: String(d.title ?? ""),
    type: String(d.type ?? ""),
  }));
}

// ─── Títulos de la biblioteca (para el tag [plex]) ─────────────────────────

const TITLE_CACHE_TTL = 10 * 60 * 1000;
let titlesCache: {
  at: number;
  movies: string[];
  shows: string[];
} | null = null;

function normTitle(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface PlexLibraryTitles {
  movies: string[];
  shows: string[];
}

async function fetchSectionTitles(key: string, type: number): Promise<string[]> {
  const titles: string[] = [];
  let start = 0;
  const size = 500;
  for (;;) {
    const data = await plexFetch(
      `/library/sections/${key}/all?type=${type}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`,
      {},
      20_000,
    );
    const mc = data?.MediaContainer;
    const items = mc?.Metadata ?? [];
    for (const it of items) {
      const t = normTitle(it.title);
      if (t) titles.push(t);
    }
    const total = Number(mc?.totalSize ?? titles.length);
    start += items.length;
    if (items.length === 0) break;
    if (start >= total || items.length < size) break; // última página
  }
  return titles;
}

/** Títulos normalizados de películas y series presentes en Plex (cache 10 min). */
export async function getPlexLibraryTitles(
  force = false,
): Promise<PlexLibraryTitles> {
  if (
    !force &&
    titlesCache &&
    Date.now() - titlesCache.at < TITLE_CACHE_TTL
  ) {
    return { movies: titlesCache.movies, shows: titlesCache.shows };
  }

  const sections = await getPlexSections();
  const movies: string[] = [];
  const shows: string[] = [];
  await Promise.all(
    sections.map(async (s) => {
      if (s.type === "movie") {
        movies.push(...(await fetchSectionTitles(s.key, 1)));
      } else if (s.type === "show") {
        shows.push(...(await fetchSectionTitles(s.key, 2)));
      }
    }),
  );

  const out: PlexLibraryTitles = {
    movies: [...new Set(movies)],
    shows: [...new Set(shows)],
  };
  titlesCache = { at: Date.now(), ...out };
  return out;
}

// ─── Rescan de librerías ────────────────────────────────────────────────────

/** Fuerza a Plex a reescanear todas las librerías de películas y series. */
export async function refreshPlexLibraries(): Promise<{
  refreshed: number;
  total: number;
}> {
  const sections = await getPlexSections();
  const media = sections.filter(
    (s) => s.type === "movie" || s.type === "show",
  );
  let refreshed = 0;
  await Promise.all(
    media.map(async (s) => {
      try {
        await plexFetch(`/library/sections/${s.key}/refresh`, {}, 8_000);
        refreshed += 1;
      } catch (err: any) {
        console.warn(
          `[plex] refresh sección '${s.title}' falló: ${err?.message ?? err}`,
        );
      }
    }),
  );
  return { refreshed, total: media.length };
}

// ─── Episodios de una serie (columna "Plex" del detalle) ─────────────────────

const EPISODES_CACHE_TTL = 10 * 60 * 1000;
const episodesCache = new Map<
  string,
  { at: number; found: boolean; episodes: string[] }
>();

async function fetchSectionAll(key: string, type: number): Promise<any[]> {
  const out: any[] = [];
  let start = 0;
  const size = 500;
  for (;;) {
    const data = await plexFetch(
      `/library/sections/${key}/all?type=${type}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`,
      {},
      20_000,
    );
    const items = data?.MediaContainer?.Metadata ?? [];
    out.push(...items);
    const total = Number(data?.MediaContainer?.totalSize ?? out.length);
    start += items.length;
    if (items.length === 0) break;
    if (start >= total || items.length < size) break; // última página
  }
  return out;
}

/**
 * Títulos normalizados de un show de Plex: el localizado (`title`) y el
 * original (`originalTitle`). Plex suele mostrar el título en español
 * ("Linternas") mientras TransMule guarda el de TMDB/TVDB ("Lanterns") —
 * comparar solo el localizado rompe el match.
 */
function showTitleCandidates(show: any): string[] {
  const out: string[] = [];
  for (const t of [show?.title, show?.originalTitle, show?.original_title]) {
    const n = normTitle(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function findShowByTitle(shows: any[], key: string): any | null {
  // 1) Igualdad con cualquiera de los títulos (title / originalTitle)
  const exact = shows.find((s) => showTitleCandidates(s).includes(key));
  if (exact) return exact;
  // 2) Fallback includes mutuo (≥4 chars) sobre cualquiera de los títulos
  return (
    shows.find((s) =>
      showTitleCandidates(s).some((t) => key.length >= 4 && (t.includes(key) || key.includes(t))),
    ) ?? null
  );
}

/**
 * Episodios existentes en Plex para una serie ("season-episode" strings,
 * p.ej. "3-8"), localizando el show por título normalizado (localizado +
 * originalTitle). Cache 10 min. Devuelve null si Plex no está configurado.
 */
export async function getPlexSeriesEpisodes(
  seriesTitle: string,
  force = false,
): Promise<{ found: boolean; episodes: string[] } | null> {
  if (!getPlexCredentials()) return null;

  const key = normTitle(seriesTitle);
  if (!key) return { found: false, episodes: [] };

  const cached = episodesCache.get(key);
  if (
    !force &&
    cached &&
    Date.now() - cached.at < EPISODES_CACHE_TTL
  ) {
    return { found: cached.found, episodes: cached.episodes };
  }

  const sections = await getPlexSections();
  const showSection = sections.find((s) => s.type === "show");
  if (!showSection) return { found: false, episodes: [] };

  const shows = await fetchSectionAll(showSection.key, 2);
  const show = findShowByTitle(shows, key);

  if (!show) {
    episodesCache.set(key, { at: Date.now(), found: false, episodes: [] });
    return { found: false, episodes: [] };
  }

  // allLeaves: todos los episodios de la serie en una llamada (type=4)
  const leaves = await plexFetch(
    `/library/metadata/${show.ratingKey}/allLeaves?type=4`,
    {},
    30_000,
  );
  const items = leaves?.MediaContainer?.Metadata ?? [];
  const episodes: string[] = [];
  for (const it of items) {
    const s = Number(it.parentIndex);
    const e = Number(it.index);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      episodes.push(`${s}-${e}`);
    }
  }
  const out = { found: true, episodes: [...new Set(episodes)] };
  episodesCache.set(key, { at: Date.now(), ...out });
  return out;
}