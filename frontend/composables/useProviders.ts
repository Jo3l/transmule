/**
 * Composable for interacting with the unified provider API.
 * Caches the provider list per session.
 */
export interface ProviderMeta {
  id: string;
  name: string;
  icon: string;
  /** Only present for media plugins; torrent-search plugins omit this */
  mediaType?: string;
  /** "media" (default) or "torrent-search" */
  pluginType?: string;
  description?: string;
  enabled: boolean;
  hasDetail: boolean;
  hasCover: boolean;
  filters: ProviderFilter[];
  filename?: string;
  /** Plugin version string, if the plugin declares meta.version */
  version?: string | null;
  /** Repository manifest URL, if the plugin declares meta.repository */
  repository?: string | null;
  /** ID of the plugin_repositories row that installed this plugin, if any */
  sourceRepoId?: number | null;
  /** Whether the plugin declares a settings section (rendered generically). */
  hasSettings?: boolean;
  /** The plugin's settings descriptor (opaque to the core frontend). */
  settings?: Record<string, any> | null;
}

export interface ProviderFilter {
  key: string;
  label: string;
  type: "text" | "select";
  options?: { label: string; value: string }[];
  defaultValue?: string;
}

/** A flat torrent-search source entry (a plugin, or a plugin's sub-source). */
export interface TorrentSearchSource {
  id: string;
  name: string;
  icon: string;
  pluginId: string;
  subSource?: string;
}

export interface MediaTag {
  label: string;
  variant?: string;
  icon?: string;
  tooltip?: string;
}

export interface MediaLink {
  label?: string;
  url: string;
  quality?: string;
  type?: string;
  size?: string;
  seeds?: number;
  hash?: string;
  tags?: MediaTag[];
  /**
   * Target download service. Defaults to "transmission" when absent.
   */
  service?: "transmission" | "amule" | "pyload" | "direct";
}

export interface MediaEpisode {
  code: string;
  links: MediaLink[];
  date?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  cover?: string;
  year?: number | string;
  date?: string;
  genre?: string;
  rating?: number | string;
  runtime?: number;
  description?: string;
  format?: string;
  size?: string;
  director?: string;
  actors?: string;
  language?: string;
  genres?: string[];
  links?: MediaLink[];
  episodes?: MediaEpisode[];
  isSeries?: boolean;
  sourceUrl?: string;
  needsDetail?: boolean;
}

export interface ProviderListResult {
  items: MediaItem[];
  total?: number;
  page?: number;
  hasMore?: boolean;
}

export function useProviders() {
  const { apiFetch } = useApi();
  const _providers = useState<ProviderMeta[] | null>("_providers", () => null);
  const _searchSources = useState<TorrentSearchSource[] | null>(
    "_searchSources",
    () => null,
  );

  async function loadProviders(force = false): Promise<ProviderMeta[]> {
    if (_providers.value && !force) return _providers.value;
    const data = await apiFetch<ProviderMeta[]>("/api/providers");
    _providers.value = data ?? [];
    return _providers.value;
  }

  /** Load the flat torrent-search source list (plugins + sub-sources). */
  async function loadSearchSources(force = false): Promise<TorrentSearchSource[]> {
    if (_searchSources.value && !force) return _searchSources.value;
    const data = await apiFetch<{ sources: TorrentSearchSource[] }>(
      "/api/providers/search-sources",
    );
    _searchSources.value = data?.sources ?? [];
    return _searchSources.value;
  }

  /**
   * Invalidate the cached search-source list so the next loadSearchSources()
   * re-fetches. Call this after a plugin's sub-sources change (e.g. enabling
   * an Indexerr instance) so search dropdowns pick it up without a full reload.
   */
  function invalidateSearchSources(): void {
    _searchSources.value = null;
  }

  /** Flat torrent-search sources (enabled plugins + their sub-sources). */
  const torrentSearchSources = computed(() => _searchSources.value ?? []);

  function getProviders(mediaType?: string): ProviderMeta[] {
    if (!_providers.value) return [];
    const list = _providers.value.filter((p) => p.enabled && p.pluginType !== "torrent-search");
    if (mediaType) return list.filter((p) => p.mediaType === mediaType);
    return list;
  }

  /** Returns enabled torrent-search plugins */
  const torrentSearchProviders = computed(() =>
    (_providers.value ?? []).filter((p) => p.pluginType === "torrent-search" && p.enabled),
  );

  /** Returns enabled media (non-torrent) plugins */
  const mediaProviders = computed(() =>
    (_providers.value ?? []).filter((p) => p.pluginType !== "torrent-search" && p.enabled),
  );

  const hasTorrentSearchProviders = computed(() => torrentSearchProviders.value.length > 0);

  async function toggleProvider(id: string, enabled: boolean): Promise<void> {
    await apiFetch("/api/providers/toggle", {
      method: "POST",
      body: { id, enabled },
    });
    // Update local cache
    if (_providers.value) {
      _providers.value = _providers.value.map((p) => (p.id === id ? { ...p, enabled } : p));
    }
  }

  async function fetchList(
    providerId: string,
    params: Record<string, string | number> = {},
  ): Promise<ProviderListResult> {
    const qs = new URLSearchParams();
    qs.set("id", providerId);
    for (const [k, v] of Object.entries(params)) {
      if (v !== "" && v !== undefined && v !== null) qs.set(k, String(v));
    }
    return apiFetch<ProviderListResult>(`/api/providers/list?${qs.toString()}`);
  }

  async function fetchDetail(providerId: string, url: string): Promise<MediaItem> {
    return apiFetch<MediaItem>(
      `/api/providers/detail?id=${encodeURIComponent(providerId)}&url=${encodeURIComponent(url)}`,
    );
  }

  async function fetchCover(providerId: string, title: string): Promise<string | null> {
    const data = await apiFetch<{ cover: string | null }>(
      `/api/providers/cover?id=${encodeURIComponent(providerId)}&title=${encodeURIComponent(title)}`,
    );
    return data?.cover ?? null;
  }

  async function uploadPlugin(file: File): Promise<void> {
    const form = new FormData();
    form.append("file", file, file.name);
    await apiFetch("/api/providers/upload", { method: "POST", body: form });
    // Force full reload on next call
    _providers.value = null;
    _searchSources.value = null;
  }

  async function deletePlugin(id: string): Promise<void> {
    await apiFetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (_providers.value) {
      _providers.value = _providers.value.filter((p) => p.id !== id);
    }
    _searchSources.value = null;
  }

  async function installFromUrl(url: string): Promise<{ id: string; filename: string }> {
    const result = await apiFetch<{ id: string; filename: string }>("/api/providers/install-url", {
      method: "POST",
      body: { url },
    });
    _providers.value = null;
    _searchSources.value = null;
    return result;
  }

  async function checkUpdates(): Promise<UpdateInfo[]> {
    return apiFetch<UpdateInfo[]>("/api/providers/check-updates");
  }

  return {
    providers: _providers,
    torrentSearchProviders,
    torrentSearchSources,
    mediaProviders,
    hasTorrentSearchProviders,
    loadProviders,
    loadSearchSources,
    invalidateSearchSources,
    getProviders,
    toggleProvider,
    uploadPlugin,
    deletePlugin,
    installFromUrl,
    checkUpdates,
    fetchList,
    fetchDetail,
    fetchCover,
  };
}

export interface UpdateInfo {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  url: string;
  hasUpdate: boolean;
}
