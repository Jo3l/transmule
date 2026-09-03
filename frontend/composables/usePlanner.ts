/**
 * usePlanner — cliente API del planificador.
 *
 * Envuelve los endpoints /api/planner/* con tipos.
 */

interface PlannerSubscription {
  id: number;
  type: "series" | "movie";
  tmdb_id: number | null;
  tvdb_id: number | null;
  imdb_id: string | null;
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string | null;
  status: string;
  monitored: number;
  min_quality: "uhd" | "fullhd" | "hd" | "sd";
  max_size_mb: number | null;
  root_folder: string;
  search_services_json: string | null;
  language: string | null;
  smart_rename: number;
  plex_scan: number;
  parent_subscription_id: number | null;
  season_filter: number | null;
  added_at: string;
  ended_at: string | null;
  metadata_synced_at: string | null;
  metadata_json: string | null;
}

interface PlannerSeason {
  id: number;
  subscription_id: number;
  season_number: number;
  monitored: number;
  episode_count: number | null;
  aired_count: number | null;
}

interface PlannerEpisode {
  id: number;
  subscription_id: number;
  season_id: number;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  title: string | null;
  air_date: string | null;
  runtime: number | null;
  monitored: number;
  status: string;
  file_path: string | null;
  downloaded_quality: string | null;
  grabbed_at: string | null;
  downloaded_at: string | null;
  last_search_at: string | null;
  search_attempts: number;
}

export interface TmdbSearchResult {
  id: number;
  title: string;
  overview: string | null;
  release_date: string | null;
  poster_url: string | null;
  vote_average: number | null;
  media_type: "movie" | "tv";
}

export interface TvdbSearchResult {
  id: number;
  name: string;
  first_air_time: string | null;
  year: string | null;
  image_url: string | null;
  overview: string | null;
  status: string | null;
}

export interface TvdbLanguage {
  code: string;
  tvdb: string;
  name: string;
}

export interface TmdbPopularItem {
  id: number;
  title: string;
  original_title: string;
  overview: string | null;
  date: string | null;
  poster_url: string | null;
  vote_average: number | null;
  media_type: "movie" | "tv";
}

export interface PlannerStatus {
  hasTvdb: boolean;
  hasTmdb: boolean;
  hasMetadataIntegration: boolean;
  searchPluginCount: number;
  hasSearchPlugins: boolean;
  /** Localización configurada en Integraciones (p. ej. "es-ES"). */
  tmdbLocale: string;
  tvdbLocale: string;
}

export interface ReleaseCandidate {
  url: string;
  hash: string | null;
  sizeMb: number | null;
  seeds: number | null;
  leechers: number | null;
  sources: number | null;
  username: string | null;
  service: string | null;
  rawName: string;
  title: string;
  quality: string;
  source: string;
  languages: string[];
  season: number | null;
  episode: number | null;
  year: number | null;
  score: number;
  rejectedReason: string | null;
}

export function usePlanner() {
  const { apiFetch } = useApi();
  const config = useRuntimeConfig();

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async function listSubscriptions(opts: { type?: string; monitored?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.type) params.set("type", opts.type);
    if (opts.monitored !== undefined) params.set("monitored", String(opts.monitored));
    const qs = params.toString();
    return apiFetch<PlannerSubscription[]>(
      `/api/planner/subscriptions${qs ? `?${qs}` : ""}`,
    );
  }

  async function getSubscription(id: number) {
    return apiFetch<PlannerSubscription & { seasons?: PlannerSeason[]; movie?: any }>(
      `/api/planner/subscriptions/${id}`,
    );
  }

  async function createSubscription(body: Record<string, unknown>) {
    return apiFetch<PlannerSubscription>("/api/planner/subscriptions", {
      method: "POST",
      body,
    });
  }

  async function updateSubscription(id: number, body: Record<string, unknown>) {
    return apiFetch<PlannerSubscription>(`/api/planner/subscriptions/${id}`, {
      method: "PATCH",
      body,
    });
  }

  async function deleteSubscription(id: number) {
    return apiFetch<{ ok: boolean }>(`/api/planner/subscriptions/${id}`, {
      method: "DELETE",
    });
  }

  async function refreshSubscription(id: number) {
    return apiFetch<{ ok: boolean; seasons?: number; episodes?: number }>(
      `/api/planner/subscriptions/${id}/refresh`,
      { method: "POST" },
    );
  }

  async function searchSubscription(id: number, body: Record<string, unknown> = {}) {
    return apiFetch<{ ok: boolean; queued: boolean }>(
      `/api/planner/subscriptions/${id}/search`,
      { method: "POST", body },
    );
  }

  async function getSubscriptionHistory(id: number, limit = 50) {
    return apiFetch<Record<string, unknown>[]>(
      `/api/planner/subscriptions/${id}/history?limit=${limit}`,
    );
  }

  async function updateEpisode(subId: number, epId: number, body: Record<string, unknown>) {
    return apiFetch<PlannerEpisode>(
      `/api/planner/subscriptions/${subId}/episodes/${epId}`,
      { method: "PATCH", body },
    );
  }

  // ── Search TMDB / TVDB ────────────────────────────────────────────────────

  async function searchTmdb(query: string, opts: { type?: string; year?: number } = {}) {
    const params = new URLSearchParams({ q: query });
    if (opts.type) params.set("type", opts.type);
    if (opts.year) params.set("year", String(opts.year));
    const res = await apiFetch<{ results: TmdbSearchResult[] }>(
      `/api/planner/search/tmdb?${params.toString()}`,
    );
    return res.results;
  }

  async function searchTvdb(query: string, opts: { year?: number } = {}) {
    const params = new URLSearchParams({ q: query });
    if (opts.year) params.set("year", String(opts.year));
    const res = await apiFetch<{ results: TvdbSearchResult[] }>(
      `/api/planner/search/tvdb?${params.toString()}`,
    );
    return res.results;
  }

  /** Búsqueda de series con fallback TVDB→TMDB; devuelve la fuente usada. */
  async function searchSeries(query: string, opts: { year?: number } = {}) {
    const params = new URLSearchParams({ q: query });
    if (opts.year) params.set("year", String(opts.year));
    return apiFetch<{
      source: "tvdb" | "tmdb";
      results: (TvdbSearchResult | TmdbSearchResult)[];
    }>(`/api/planner/search/series?${params.toString()}`);
  }

  /** Estado de integraciones (TVDB/TMDB) y plugins de búsqueda. */
  async function getPlannerStatus() {
    return apiFetch<PlannerStatus>("/api/planner/status");
  }

  /** Idiomas en los que TVDB tiene el nombre de la serie traducido. */
  async function getTvdbTranslations(id: number) {
    const res = await apiFetch<{ languages: TvdbLanguage[] }>(
      `/api/planner/metadata/tvdb/series/${id}/translations`,
    );
    return res.languages ?? [];
  }

  /** Idiomas en los que TMDB tiene la película traducida (título/sinopsis). */
  async function getTmdbTranslations(id: number) {
    const res = await apiFetch<{ languages: { code: string; name: string }[] }>(
      `/api/planner/metadata/tmdb/movie/${id}/translations`,
    );
    return res.languages ?? [];
  }

  /** Títulos populares (series y películas) de TMDB para los sliders del dashboard. */
  async function discoverPopular(opts: { language?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (opts.language) params.set("language", opts.language);
    if (opts.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return apiFetch<{ series: TmdbPopularItem[]; movies: TmdbPopularItem[] }>(
      `/api/planner/discover/popular${qs ? `?${qs}` : ""}`,
    );
  }

  // ── Búsqueda interactiva unificada (Fase 14) ──────────────────────────────

  /**
   * Búsqueda de releases en STREAMING (SSE): invoca onBatch(service, candidates)
   * en cuanto cada red termina, sin esperar a las demás. Devuelve al cerrar el
   * stream (evento `complete`).
   */
  async function searchReleasesStreamed(
    body: Record<string, unknown>,
    onBatch: (service: string, candidates: ReleaseCandidate[]) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
    const base = config.public?.apiBase ?? "";
    const res = await fetch(`${base}/api/planner/search/stream?${params.toString()}`, {
      credentials: "include",
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`search stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // El patrón de buffer preserva eventos parciales entre chunks TCP.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const ev of parts) {
        const lines = ev.split("\n");
        let type = "", data = "";
        for (const l of lines) {
          if (l.startsWith("event: ")) type = l.slice(7);
          else if (l.startsWith("data: ")) data = l.slice(6);
        }
        if (!type || !data) continue;
        try {
          const d = JSON.parse(data);
          if (type === "result") onBatch(d.service, d.candidates ?? []);
        } catch { /* skip */ }
      }
    }
  }

  async function grabRelease(body: Record<string, unknown>) {
    return apiFetch<{ ok: boolean; queued: boolean; grab: number }>(
      "/api/planner/grabs",
      { method: "POST", body },
    );
  }

  return {
    listSubscriptions,
    getSubscription,
    createSubscription,
    updateSubscription,
    deleteSubscription,
    refreshSubscription,
    searchSubscription,
    getSubscriptionHistory,
    updateEpisode,
    searchTmdb,
    searchTvdb,
    searchSeries,
    getPlannerStatus,
    getTvdbTranslations,
    getTmdbTranslations,
    discoverPopular,
    searchReleasesStreamed,
    grabRelease,
  };
}
