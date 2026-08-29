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
 *     (S01E01 / 1x01 / 101) para maximizar recall. Solo título + episodio/año.
 *     El idioma, el título del episodio, la calidad y el tamaño se aplican en
 *     el scoring (decision-engine), NUNCA en la query: los marcadores de idioma
 *     multiplicarían las búsquedas en paralelo sin aportar recall.
 *   - Cada provider ejecuta sus variantes de query en PARALELO y deduplica.
 *   - `amule` usa una única query booleana AND/OR/NOT con AND explícito + paréntesis
 *     y con cada título ENTRE COMILLAS ("{título original}" OR "{título localizado}"),
 *     porque su API solo retiene la última búsqueda, el parser limita la expresión
 *     a 10 operadores booleanos (contando los AND implícitos de cada palabra) y las
 *     comillas convierten cada título en un único token.
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
import { parseReleaseName, isVideoFile } from "./release-parser";
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Query builders (multi-variante) ────────────────────────────────────────

/** Variantes de query para un episodio: `S01E01` + `1x01` + `101`.
 *  `altTitles` (títulos localizados) añaden variantes adicionales (p.ej.
 *  "Linternas S01E01" además de "Lanterns S01E01"). Solo título + episodio:
 *  el idioma se valida en el scoring, no se añade a la query (evita multiplicar
 *  las búsquedas en paralelo con marcadores de idioma). */
export function buildEpisodeQueries(
  title: string,
  season: number,
  episode: number,
  altTitles?: string[],
): string[] {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  // Formato "101" (SxxEyy → xyy): S01E06 → 106, S10E06 → 1006.
  const abs = String(season) + e;
  const titles = dedupeTitles([title, ...(altTitles ?? [])]);
  const bases: string[] = [];
  for (const t of titles) {
    bases.push(`${t} S${s}E${e}`, `${t} ${season}x${e}`, `${t} ${abs}`);
  }
  return bases;
}

/** Variantes de query para una película: `{title} {year}` (+ títulos
 *  localizados). Solo título + año; el idioma se valida en el scoring. */
export function buildMovieQueries(
  title: string,
  year?: number,
  altTitles?: string[],
): string[] {
  const titles = dedupeTitles([title, ...(altTitles ?? [])]);
  return titles.map((t) => (year ? `${t} ${year}` : t));
}

/** Query booleana para aMule. El parser (Parser.y) solo aplica AND implícito
 *  entre PALABRAS (and_strings), NO entre una palabra y un grupo entre
 *  paréntesis, y limita la expresión a 10 operadores booleanos (AND/OR/NOT) —
 *  contando también los AND implícitos de cada cadena de palabras. Por eso:
 *   - cada TÍTULO va entre comillas dobles → un solo token por título (sin
 *     ANDs implícitos por palabra), dejando presupuesto de operadores para el
 *     grupo de episodio y para los títulos alternativos (original + localizado);
 *   - AND explícito antes del grupo, y OR entre las variantes de episodio
 *     DENTRO del paréntesis:
 *     ("Título original" OR "Título localizado") AND (S01E06 OR 1x06 OR 106)
 */
export function buildAmuleEpisodeQuery(
  title: string,
  season: number,
  episode: number,
  altTitles?: string[],
): string {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  const abs = String(season) + e; // "101": S01E06 → 106
  const titles = dedupeTitles([title, ...(altTitles ?? [])]).map(quoteTitle);
  const titleGroup = titles.length > 1 ? `(${titles.join(" OR ")})` : titles[0];
  const epGroup = `(S${s}E${e} OR ${season}x${e} OR ${abs})`;
  return `${titleGroup} AND ${epGroup}`;
}

/** Query booleana para aMule (películas). Misma regla que episodios: cada
 *  título entre comillas (un token, sin ANDs implícitos por palabra), OR entre
 *  títulos va entre paréntesis, y el año se une con AND explícito:
 *  "Título" AND 2022 o ("Título1" OR "Título2") AND 2022. */
export function buildAmuleMovieQuery(
  title: string,
  year?: number,
  altTitles?: string[],
): string {
  const titles = dedupeTitles([title, ...(altTitles ?? [])]).map(quoteTitle);
  const titleGroup = titles.length > 1 ? `(${titles.join(" OR ")})` : titles[0];
  return year ? `${titleGroup} AND ${year}` : titleGroup;
}

/** Entrecomilla un título para aMule: "Star Trek: Strange New Worlds" es UN
 *  token para Parser.y (Scanner.l), así las palabras del título no consumen
 *  ANDs implícitos del límite de 10 operadores booleanos. */
function quoteTitle(t: string): string {
  return `"${String(t ?? "").replace(/"/g, "")}"`;
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

// ─── Direct plugin provider (torrent-search) ────────────────────────────────

async function searchDirectPlugins(queries: string[]): Promise<SearchResultItem[]> {
  // Ejecuta TODAS las variantes de query en paralelo (S01E01, 1x01, 101).
  // Límite alto (100 por variante) para no recortar resultados artificialmente.
  const batches = await Promise.all(
    queries.map((query) =>
      searchTorrents({ query, source: "all", limit: 100 }).catch(() => []),
    ),
  );

  const items: SearchResultItem[] = [];
  for (const results of batches) {
    for (const r of results) {
      // Ignorar ficheros no-vídeo (subs .srt, .nfo, .torrent, imágenes...).
      if (!isVideoFile(r.name)) continue;
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

  // Solo se sondean las búsquedas que se crearon de verdad: si createSearch
  // falla (slskd caído), su id nunca aparecerá en getSearches() y el bucle
  // esperaría para siempre sin el timeout.
  const created: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const ok = await client.createSearch(ids[i], queries[i]).catch(() => false);
    if (ok !== false) created.push(ids[i]);
  }
  if (created.length === 0) return;

  const seen = new Set<string>();
  const pending = new Set(created);
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
    for (const id of created) {
      const files = await client.getSearchResponses(id).catch(() => []);
      for (const f of files) {
        if (!isVideoFile(f.filename)) continue;
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
    const fresh = files
      .filter((f: any) => isVideoFile(f.fileName ?? ""))
      .map(amuleToItem)
      .filter((it) => {
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
  timeoutMs = 60_000,
  altTitles?: string[],
): Promise<SearchResultItem[]> {
  const collected: SearchResultItem[] = [];
  const done = searchEpisodeStreamed(
    title,
    season,
    episode,
    searchServices,
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
  timeoutMs = 60_000,
  altTitles?: string[],
): Promise<SearchResultItem[]> {
  const collected: SearchResultItem[] = [];
  const done = searchMovieStreamed(
    title,
    year,
    searchServices,
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
  onResult: (service: SearchProviderId, items: SearchResultItem[]) => void,
  timeoutMs?: number,
  altTitles?: string[],
): Promise<void> {
  const providers = normalizeProviders(searchServices);
  // Queries: título (localizado) + episodio (S01E01 / 1x01 / 101). El idioma,
  // la calidad y el tamaño se aplican en decision-engine, no en la query.
  const queries = buildEpisodeQueries(title, season, episode, altTitles);
  const amuleQuery = buildAmuleEpisodeQuery(title, season, episode, altTitles);
  console.log(
    `[planner] episode queries (slskd/torrent): ${queries.join(" · ")} · aMule: ${amuleQuery}`,
  );

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
  onResult: (service: SearchProviderId, items: SearchResultItem[]) => void,
  timeoutMs?: number,
  altTitles?: string[],
): Promise<void> {
  const providers = normalizeProviders(searchServices);
  // Queries: título (localizado) + año. El idioma se valida en decision-engine.
  const queries = buildMovieQueries(title, year, altTitles);
  const amuleQuery = buildAmuleMovieQuery(title, year, altTitles);
  console.log(
    `[planner] movie queries (slskd/torrent): ${queries.join(" · ")} · aMule: ${amuleQuery}`,
  );

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
