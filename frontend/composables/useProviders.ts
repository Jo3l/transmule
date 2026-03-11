/**
 * Composable for interacting with the unified provider API.
 * Caches the provider list per session.
 */
export interface ProviderMeta {
  id: string;
  name: string;
  icon: string;
  mediaType: "movies" | "shows";
  description?: string;
  enabled: boolean;
  hasDetail: boolean;
  hasCover: boolean;
  filters: ProviderFilter[];
  builtin: boolean;
  filename?: string;
}

export interface ProviderFilter {
  key: string;
  label: string;
  type: "text" | "select";
  options?: { label: string; value: string }[];
  defaultValue?: string;
}

export interface MediaLink {
  label?: string;
  url: string;
  quality?: string;
  type?: string;
  size?: string;
  seeds?: number;
  hash?: string;
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

  async function loadProviders(force = false): Promise<ProviderMeta[]> {
    if (_providers.value && !force) return _providers.value;
    const data = await apiFetch<ProviderMeta[]>("/api/providers");
    _providers.value = data ?? [];
    return _providers.value;
  }

  function getProviders(mediaType?: "movies" | "shows"): ProviderMeta[] {
    if (!_providers.value) return [];
    const list = _providers.value.filter((p) => p.enabled);
    if (mediaType) return list.filter((p) => p.mediaType === mediaType);
    return list;
  }

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
  }

  async function deletePlugin(id: string): Promise<void> {
    await apiFetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (_providers.value) {
      _providers.value = _providers.value.filter((p) => p.id !== id);
    }
  }

  return {
    providers: _providers,
    loadProviders,
    getProviders,
    toggleProvider,
    uploadPlugin,
    deletePlugin,
    fetchList,
    fetchDetail,
    fetchCover,
  };
}
