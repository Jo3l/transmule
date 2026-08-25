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
 *   - `slskd` sondea el estado de la búsqueda hasta que termina (no un sleep
 *     fijo), porque las respuestas llegan lentas desde la red Soulseek.
 */

import { searchTorrents } from "../../torrent-search/index";
import type { ParsedRelease } from "./release-parser";
import { parseReleaseName, languageQueryMarkers } from "./release-parser";
import { useSlskdClient } from "../../utils/slskd-client";
import { useAmuleClient } from "../../utils/amule-client";

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

// ─── Query builders (multi-variante) ────────────────────────────────────────

/** Variantes de query para un episodio: `S01E01` + `1x01` (+ sufijos de idioma). */
export function buildEpisodeQueries(
  title: string,
  season: number,
  episode: number,
  language?: string,
): string[] {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  const bases = [
    `${title} S${s}E${e}`,
    `${title} ${season}x${episode}`,
  ];
  return withLanguageVariants(bases, language);
}

/** Variantes de query para una película: `{title} {year}` (+ sufijos de idioma). */
export function buildMovieQueries(
  title: string,
  year?: number,
  language?: string,
): string[] {
  const base = year ? `${title} ${year}` : title;
  return withLanguageVariants([base], language);
}

/** Query booleana para aMule: une las variantes SxxExx / 1x01 con OR. */
function buildAmuleEpisodeQuery(title: string, season: number, episode: number): string {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${title} S${s}E${e} OR ${title} ${season}x${episode}`;
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
  const batches = await Promise.all(
    queries.map((query) =>
      searchTorrents({ query, source: "all", limit: 30 }).catch(() => []),
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

// ─── slskd provider ─────────────────────────────────────────────────────────

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

async function searchSlskd(queries: string[]): Promise<SearchResultItem[]> {
  const client = useSlskdClient();
  const ids = queries.map(() => crypto.randomUUID());

  // Lanza todas las búsquedas en paralelo (cada una con su id).
  await Promise.all(
    ids.map((id, i) => client.createSearch(id, queries[i]).catch(() => false)),
  );

  // slskd tarda en recibir respuestas (la búsqueda viaja por la red Soulseek).
  // En lugar de esperar un tiempo fijo corto, sondeamos el estado de cada
  // búsqueda hasta que termine (o se alcance el timeout).
  const POLL_MS = 2000;
  const MAX_WAIT_MS = 30000;
  const started = Date.now();
  const pending = new Set(ids);
  while (pending.size > 0 && Date.now() - started < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const searches = await client.getSearches().catch(() => []);
    for (const id of [...pending]) {
      const s = searches.find((x) => x.id === id);
      if (s && isSearchDone(s)) pending.delete(id);
    }
  }

  const items: SearchResultItem[] = [];
  for (const id of ids) {
    const files = await client.getSearchResponses(id).catch(() => []);
    for (const f of files) {
      // Solo extensiones de vídeo
      if (!VIDEO_EXT_RE.test(f.filename)) continue;
      items.push({
        url: `slskd://${f.username}/${f.filename}`,
        sizeMb: f.size ? Math.round(f.size / 1024 / 1024) : undefined,
        service: "slskd" as const,
        parsed: parseReleaseName(f.filename),
        rawName: f.filename,
      });
    }
  }
  return dedupe(items);
}

// ─── aMule provider ─────────────────────────────────────────────────────────

async function searchAmule(query: string): Promise<SearchResultItem[]> {
  const client = useAmuleClient();
  // Búsqueda asíncrona en aMule (ED2K) — sin tipo ni filtros (default global).
  // aMule solo retiene la última búsqueda, por eso se le pasa UNA query
  // booleana con OR (p. ej. `S01E01 OR 1x01`) en vez de lanzar varias.
  const searchId = await client.searchAsync(query).catch(() => null);
  if (!searchId) return [];

  await new Promise((r) => setTimeout(r, 8000));
  const resp = await client.searchResults().catch(() => null);
  if (!resp?.files) return [];

  return dedupe(
    resp.files.map((r: any) => {
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
    }),
  );
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
 *
 * @param searchServices lista de provider ids habilitados.
 * @param language código ISO de idioma preferido (opcional) — añade sufijos
 *                 de idioma a las queries y se propaga al parseo/candidatos.
 */
export async function searchEpisode(
  title: string,
  season: number,
  episode: number,
  searchServices: string[],
  language?: string,
): Promise<SearchResultItem[]> {
  const providers = normalizeProviders(searchServices);
  const queries = buildEpisodeQueries(title, season, episode, language);

  const tasks: Promise<SearchResultItem[]>[] = [];
  if (providers.includes("direct-plugin")) tasks.push(searchDirectPlugins(queries));
  if (providers.includes("slskd")) tasks.push(searchSlskd(queries));
  if (providers.includes("amule")) tasks.push(searchAmule(buildAmuleEpisodeQuery(title, season, episode)));

  const settled = await Promise.allSettled(tasks);
  const results = settled
    .filter((r): r is PromiseFulfilledResult<SearchResultItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  return dedupe(results);
}

/**
 * Busca una película en los servicios habilitados.
 */
export async function searchMovie(
  title: string,
  year: number | undefined,
  searchServices: string[],
  language?: string,
): Promise<SearchResultItem[]> {
  const providers = normalizeProviders(searchServices);
  const queries = buildMovieQueries(title, year, language);

  const tasks: Promise<SearchResultItem[]>[] = [];
  if (providers.includes("direct-plugin")) tasks.push(searchDirectPlugins(queries));
  if (providers.includes("slskd")) tasks.push(searchSlskd(queries));
  if (providers.includes("amule")) tasks.push(searchAmule(queries[0]));

  const settled = await Promise.allSettled(tasks);
  const results = settled
    .filter((r): r is PromiseFulfilledResult<SearchResultItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  return dedupe(results);
}

// ─── Streaming (resultados incrementales por proveedor) ─────────────────────

/**
 * Busca un episodio en streaming: invoca `onResult(service, items)` en cuanto
 * CADA proveedor termina, sin esperar a los demás. Usado por el endpoint SSE
 * para mostrar resultados a medida que llegan (las búsquedas pueden ser lentas).
 */
export async function searchEpisodeStreamed(
  title: string,
  season: number,
  episode: number,
  searchServices: string[],
  language: string | undefined,
  onResult: (service: SearchProviderId, items: SearchResultItem[]) => void,
): Promise<void> {
  const providers = normalizeProviders(searchServices);
  const queries = buildEpisodeQueries(title, season, episode, language);
  const amuleQuery = buildAmuleEpisodeQuery(title, season, episode);

  const tasks: Promise<void>[] = [];
  if (providers.includes("direct-plugin")) {
    tasks.push(searchDirectPlugins(queries).then((r) => onResult("direct-plugin", r)));
  }
  if (providers.includes("slskd")) {
    tasks.push(searchSlskd(queries).then((r) => onResult("slskd", r)));
  }
  if (providers.includes("amule")) {
    tasks.push(searchAmule(amuleQuery).then((r) => onResult("amule", r)));
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
): Promise<void> {
  const providers = normalizeProviders(searchServices);
  const queries = buildMovieQueries(title, year, language);

  const tasks: Promise<void>[] = [];
  if (providers.includes("direct-plugin")) {
    tasks.push(searchDirectPlugins(queries).then((r) => onResult("direct-plugin", r)));
  }
  if (providers.includes("slskd")) {
    tasks.push(searchSlskd(queries).then((r) => onResult("slskd", r)));
  }
  if (providers.includes("amule")) {
    tasks.push(searchAmule(queries[0]).then((r) => onResult("amule", r)));
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
