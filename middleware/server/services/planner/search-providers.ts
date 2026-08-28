/**
 * Search providers — capa de abstracción que consulta los servicios de
 * búsqueda habilitados en paralelo y normaliza los resultados a ParsedRelease.
 *
 * Providers (Fase 7):
 *   - direct-plugin: torrent-search plugins (YTS, EZTV, 1337x, ...)
 *   - slskd: Soulseek
 *   - amule: ED2K
 *   - pyload: (no busca — es gestor de descargas directas)
 *
 * Fase 13 — búsqueda unificada:
 *   - buildEpisodeQueries/buildMovieQueries generan VARIAS variantes de query
 *     (S01E01 / 1x01, + sufijos de idioma) para maximizar recall.
 *   - Cada provider ejecuta sus variantes de query en PARALELO y deduplica.
 *   - `amule` usa una única query booleana con OR (`S01E01 OR 1x01`), porque
 *     su API solo retiene la última búsqueda.
 *
 * Fase 14 — streaming sin límites:
 *   - Modo INTERACTIVO: sin timeout. `searchEpisodeStreamed`/`searchMovieStreamed`
 *     emiten resultados NUEVOS a medida que llegan (sondeando aMule/slskd hasta
 *     que la búsqueda termina). No se recorta el número de resultados.
 *   - Modo AUTOMÁTICO: `searchEpisode`/`searchMovie` recogen resultados durante
 *     `timeoutMs` (default 60 s) y luego el scheduler decide (pickBest).
 */

import { searchTorrents } from "../../torrent-search/index";
import type { ParsedRelease } from "./release-parser";
import { parseReleaseName, languageQueryMarkers } from "./release-parser";
import { useSlskdClient } from "../../utils/slskd-client";
import { useAmuleClient, SearchType } from "../../utils/amule-client";

export interface SearchResultItem {
  /** URL / magnet / ed2k que se enviará al download client */
  url: string;
  /** Hash (info hash o ed2k) para dedup */
  hash?: string;
  /** Tamaño en MB (opcional) */
  sizeMb?: number;
  /** Seeds (solo torrents) */
  seeds?: number;
  /** Servicio que produjo el resultado */
  service: "direct-plugin" | "slskd" | "amule";
  /** Release parseado (title, season/ep, quality, source, languages...) */
  parsed: ParsedRelease;
  /** Nombre crudo del release */
  rawName: string;
}

export type SearchProviderId = "direct-plugin" | "slskd" | "amule";

const VALID_PROVIDERS: SearchProviderId[] = ["direct-plugin", "slskd", "amule"];

const VIDEO_EXT_RE = /\.(mkv|mp4|avi|ts|m2ts|webm)$/i;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Query builders (multi-variante) ────────────────────────────────────────

/** Variantes de query para un episodio: `S01E01` + `1x01` (+ sufijos de idioma).
 *  `altTitles` (títulos localizados en el idioma elegido) añaden variantes
 *  adicionales para maximizar recall (p.ej. "Linternas S01E01" además de
 *  "Lanterns S01E01"). */
export function buildEpisodeQueries(
  title: string,
  season: number,
  episode: number,
  language?: string,
  altTitles?: string[],
): string[] {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  const titles = dedupeTitles([title, ...(altTitles ?? [])]);
  const bases: string[] = [];
  for (const t of titles) {
    bases.push(`${t} S${s}E${e}`, `${t} ${season}x${e}`);
  }
  return withLanguageVariants(bases, language);
}

/** Variantes de query para una película: `{title} {year}` (+ sufijos de idioma
 *  y títulos localizados). */
export function buildMovieQueries(
  title: string,
  year?: number,
  language?: string,
  altTitles?: string[],
): string[] {
  const titles = dedupeTitles([title, ...(altTitles ?? [])]);
  const bases = titles.map((t) => (year ? `${t} ${year}` : t));
  return withLanguageVariants(bases, language);
}

/** Query booleana para aMule: une las variantes SxxExx / 1x01 con OR
 *  (incluyendo los títulos localizados). */
function buildAmuleEpisodeQuery(
  title: string,
  season: number,
  episode: number,
  altTitles?: string[],
): string {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  const titles = dedupeTitles([title, ...(altTitles ?? [])]);
  const parts: string[] = [];
  for (const t of titles) {
    parts.push(`${t} S${s}E${e}`, `${t} ${season}x${e}`);
  }
  return parts.join(" OR ");
}

/** Query booleana para aMule (películas): `{title} {year}` OR por título localizado. */
function buildAmuleMovieQuery(
  title: string,
  year?: number,
  altTitles?: string[],
): string {
  const titles = dedupeTitles([title, ...(altTitles ?? [])]);
  return titles.map((t) => (year ? `${t} ${year}` : t)).join(" OR ");
}

/** Deduplica títulos (case-insensitive, preservando el orden). */
function dedupeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of titles) {
    const clean = String(t ?? "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function withLanguageVariants(bases: string[], language?: string): string[] {
  const markers = languageQueryMarkers(language);
  if (markers.length === 0) return bases;
  const out = [...bases];
  for (const m of markers) {
    for (const b of bases) out.push(`${b} ${m}`);
  }
  return out;
}

// ─── Direct plugin provider (torrent-search) ────────────────────────────────

async function searchDirectPlugins(queries: string[]): Promise<SearchResultItem[]> {
  // Ejecuta TODAS las variantes de query en paralelo (S01E01, 1x01, idioma).
  // Límite alto (100 por variante) para no recortar resultados artificialmente.
  const batches = await Promise.all(
    queries.map((query) =>
      searchTorrents({ query, source: "all", limit: 100 }).catch(() => []),
    ),
  );

  const items: SearchResultItem[] = [];
  for (const results of batches) {
    for (const r of results) {
      items.push({
        url: r.magnet || r.downloadUrl || "",
        hash: r.infoHash,
        sizeMb: r.size != null ? Math.round(r.size / 1024 / 1024) : undefined,
        seeds: r.seeders,
        service: "direct-plugin" as const,
        parsed: parseReleaseName(r.name),
        rawName: r.name,
      });
    }
  }
  return dedupe(items);
}

// ─── slskd provider (streaming) ─────────────────────────────────────────────

/** True si una búsqueda slskd ya terminó (Completada/Cancelada/Error). */
function isSearchDone(s: { state?: string; isComplete?: boolean }): boolean {
  if (s.isComplete === true) return true;
  const st = s.state ?? "";
  return (
    st === "Completed" ||
    st.startsWith("Completed,") ||
    st === "Cancelled" ||
    st === "Errored"
  );
}

function slskdToItem(f: any): SearchResultItem {
  return {
    url: `slskd://${f.username}/${f.filename}`,
    sizeMb: f.size ? Math.round(f.size / 1024 / 1024) : undefined,
    service: "slskd" as const,
    parsed: parseReleaseName(f.filename),
    rawName: f.filename,
  };
}

/**
 * Búsqueda slskd en streaming: lanza todas las variantes en paralelo y emite
 * los resultados NUEVOS a medida que llegan. Sin timeout fijo en modo
 * interactivo; en modo automático se acota con `timeoutMs`.
 */
async function streamSlskd(
  queries: string[],
  onResult: (items: SearchResultItem[]) => void,
  timeoutMs?: number,
): Promise<void> {
  const client = useSlskdClient();
  const ids = queries.map(() => crypto.randomUUID());

  await Promise.all(
    ids.map((id, i) => client.createSearch(id, queries[i]).catch(() => false)),
  );

  const seen = new Set<string>();
  const pending = new Set(ids);
  const started = Date.now();
  while (pending.size > 0) {
    if (timeoutMs && Date.now() - started >= timeoutMs) break;
    await sleep(2000);

    const searches = await client.getSearches().catch(() => []);
    for (const id of [...pending]) {
      const s = searches.find((x) => x.id === id);
      if (s && isSearchDone(s)) pending.delete(id);
    }

    const fresh: SearchResultItem[] = [];
    for (const id of ids) {
      const files = await client.getSearchResponses(id).catch(() => []);
      for (const f of files) {
        if (!VIDEO_EXT_RE.test(f.filename)) continue;
        const key = f.filename.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(slskdToItem(f));
      }
    }
    if (fresh.length > 0) onResult(fresh);
  }
}

// ─── aMule provider (streaming) ─────────────────────────────────────────────

function amuleToItem(r: any): SearchResultItem {
  const name = r.fileName ?? "";
  const hash =
    r.hash instanceof Buffer
      ? Buffer.from(r.hash).toString("hex")
      : String(r.hash ?? "");
  return {
    url: `ed2k://|file|${encodeURIComponent(name)}|${r.sizeFull ?? 0}|${hash}|/`,
    hash: hash || undefined,
    sizeMb: r.sizeFull ? Math.round(r.sizeFull / 1024 / 1024) : undefined,
    service: "amule" as const,
    parsed: parseReleaseName(name),
    rawName: name,
  };
}

/**
 * Búsqueda aMule en streaming: lanza la búsqueda (query booleana con OR, porque
 * aMule solo retiene la última) y emite los resultados NUEVOS a medida que
 * llegan, hasta que aMule marca la búsqueda completa (progress >= 1).
 * Sin timeout fijo en modo interactivo; en modo automático se acota con `timeoutMs`.
 */
async function streamAmule(
  query: string,
  onResult: (items: SearchResultItem[]) => void,
  timeoutMs?: number,
): Promise<void> {
  const client = useAmuleClient();
  // IMPORTANTE: pasar SearchType.GLOBAL explícito. El default de la librería
  // amule-ec-client es LOCAL (0), que solo busca ficheros compartidos localmente
  // y devuelve un listado distinto (vacío) al del buscador directo, que usa GLOBAL.
  const searchId = await client.searchAsync(query, SearchType.GLOBAL).catch(() => null);
  if (!searchId) return;

  const seen = new Set<string>();
  const started = Date.now();
  while (true) {
    if (timeoutMs && Date.now() - started >= timeoutMs) break;
    await sleep(2000);

    const [resp, progress] = await Promise.all([
      client.searchResults().catch(() => null),
      client.searchStatus().catch(() => 1),
    ]);

    const files = resp?.files ?? [];
    const fresh = files.map(amuleToItem).filter((it) => {
      const key = it.hash ?? it.rawName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length > 0) onResult(fresh);

    // progress >= 1 → búsqueda completa.
    if (progress >= 1) break;
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

function normalizeProviders(ids: string[]): SearchProviderId[] {
  const alias: Record<string, string> = { "torrent-trackers": "direct-plugin" };
  return ids
    .map((s) => alias[s] ?? s)
    .filter((s): s is SearchProviderId => (VALID_PROVIDERS as string[]).includes(s));
}

/**
 * Busca un episodio en los servicios habilitados para la subscription.
 * Modo AUTOMÁTICO: recoge resultados durante `timeoutMs` (default 60 s) y
 * devuelve todos los encontrados para que el scheduler decida después.
 */
export async function searchEpisode(
  title: string,
  season: number,
  episode: number,
  searchServices: string[],
  language?: string,
  timeoutMs = 60_000,
  altTitles?: string[],
): Promise<SearchResultItem[]> {
  const collected: SearchResultItem[] = [];
  const done = searchEpisodeStreamed(
    title,
    season,
    episode,
    searchServices,
    language,
    (_svc, items) => {
      collected.push(...items);
    },
    timeoutMs,
    altTitles,
  );
  // Espera a que TODAS las búsquedas terminen o al timeout, lo que ocurra antes.
  await Promise.race([done, sleep(timeoutMs)]);
  return dedupe(collected);
}

/**
 * Busca una película en los servicios habilitados (modo automático, timeoutMs).
 */
export async function searchMovie(
  title: string,
  year: number | undefined,
  searchServices: string[],
  language?: string,
  timeoutMs = 60_000,
  altTitles?: string[],
): Promise<SearchResultItem[]> {
  const collected: SearchResultItem[] = [];
  const done = searchMovieStreamed(
    title,
    year,
    searchServices,
    language,
    (_svc, items) => {
      collected.push(...items);
    },
    timeoutMs,
    altTitles,
  );
  await Promise.race([done, sleep(timeoutMs)]);
  return dedupe(collected);
}

// ─── Streaming (resultados incrementales por proveedor) ─────────────────────

/**
 * Busca un episodio en streaming: invoca `onResult(service, items)` con los
 * resultados NUEVOS de cada proveedor a medida que llegan (sin esperar a los
 * demás ni a que la búsqueda termine). Sin timeout salvo que se pase `timeoutMs`.
 */
export async function searchEpisodeStreamed(
  title: string,
  season: number,
  episode: number,
  searchServices: string[],
  language: string | undefined,
  onResult: (service: SearchProviderId, items: SearchResultItem[]) => void,
  timeoutMs?: number,
  altTitles?: string[],
): Promise<void> {
  const providers = normalizeProviders(searchServices);
  const queries = buildEpisodeQueries(title, season, episode, language, altTitles);
  const amuleQuery = buildAmuleEpisodeQuery(title, season, episode, altTitles);

  const tasks: Promise<void>[] = [];
  if (providers.includes("direct-plugin")) {
    tasks.push(searchDirectPlugins(queries).then((r) => onResult("direct-plugin", r)));
  }
  if (providers.includes("slskd")) {
    tasks.push(streamSlskd(queries, (r) => onResult("slskd", r), timeoutMs));
  }
  if (providers.includes("amule")) {
    tasks.push(streamAmule(amuleQuery, (r) => onResult("amule", r), timeoutMs));
  }

  await Promise.allSettled(tasks);
}

/**
 * Busca una película en streaming (igual que searchEpisodeStreamed).
 */
export async function searchMovieStreamed(
  title: string,
  year: number | undefined,
  searchServices: string[],
  language: string | undefined,
  onResult: (service: SearchProviderId, items: SearchResultItem[]) => void,
  timeoutMs?: number,
  altTitles?: string[],
): Promise<void> {
  const providers = normalizeProviders(searchServices);
  const queries = buildMovieQueries(title, year, language, altTitles);

  const tasks: Promise<void>[] = [];
  if (providers.includes("direct-plugin")) {
    tasks.push(searchDirectPlugins(queries).then((r) => onResult("direct-plugin", r)));
  }
  if (providers.includes("slskd")) {
    tasks.push(streamSlskd(queries, (r) => onResult("slskd", r), timeoutMs));
  }
  if (providers.includes("amule")) {
    const amuleQuery = buildAmuleMovieQuery(title, year, altTitles);
    tasks.push(streamAmule(amuleQuery, (r) => onResult("amule", r), timeoutMs));
  }

  await Promise.allSettled(tasks);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dedupe(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.hash ?? i.rawName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Lee el JSON de `search_services` de una subscription y lo parsea.
 * Acepta el alias legacy `torrent-trackers` → `direct-plugin`.
 */
export function parseSearchServices(json: string | null): string[] {
  const fallback: string[] = ["direct-plugin", "slskd", "amule"];
  if (!json) return fallback;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return fallback;
    const alias: Record<string, string> = { "torrent-trackers": "direct-plugin" };
    const mapped = arr
      .filter((s): s is string => typeof s === "string")
      .map((s) => alias[s] ?? s)
      .filter((s) => (VALID_PROVIDERS as string[]).includes(s));
    return mapped.length > 0 ? [...new Set(mapped)] : fallback;
  } catch {
    return fallback;
  }
}
