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
  root_folder: string;
  search_services_json: string | null;
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

export interface ReleaseCandidate {
  url: string;
  hash: string | null;
  sizeMb: number | null;
  seeds: number | null;
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

  // ── Búsqueda interactiva unificada (Fase 14) ──────────────────────────────

  async function searchReleases(body: Record<string, unknown>) {
    return apiFetch<{ candidates: ReleaseCandidate[]; count: number }>(
      "/api/planner/search/releases",
      { method: "POST", body },
    );
  }

  async function grabRelease(body: Record<string, unknown>) {
    return apiFetch<{ ok: boolean; queued: boolean; grab: number }>(
      "/api/planner/grabs",
      { method: "POST", body },
    );
  }

  // ── Descarga automática (backlog + wanted) ─────────────────────────────────

  async function autoDownload() {
    return apiFetch<{ ok: boolean; started: boolean }>(
      "/api/planner/wanted/auto-grab",
      { method: "POST", body: {} },
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
    searchReleases,
    grabRelease,
    autoDownload,
  };
}
