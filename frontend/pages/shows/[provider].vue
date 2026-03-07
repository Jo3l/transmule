<template>
  <div :id="`page-provider-${providerId}`">
    <!-- Header -->
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">
          {{ mediaTypeLabel }} — {{ providerMeta?.name || providerId }}
        </h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="load">
          <span class="mdi mdi-refresh mr-1" />{{ $t("shows.refresh") }}
        </SButton>
      </div>
    </div>

    <!-- Filters -->
    <div v-if="filterDefs.length" class="provider-filters mb-4">
      <div v-for="f in textFilters" :key="f.key" class="provider-filter-search">
        <span class="mdi mdi-magnify" />
        <input
          v-model="filters[f.key]"
          class="provider-search-input"
          type="text"
          :placeholder="f.label"
          @keydown.enter="load"
        />
        <button
          v-if="filters[f.key]"
          class="provider-search-clear"
          @click="
            filters[f.key] = '';
            load();
          "
        >
          <span class="mdi mdi-close" />
        </button>
      </div>

      <div v-if="selectFilters.length" class="provider-filters-selects">
        <div v-for="f in selectFilters" :key="f.key" class="provider-filter-group">
          <label class="provider-filter-label">{{ f.label }}</label>
          <SSelect v-model="filters[f.key]" :options="f.options || []" @update:model-value="load" />
        </div>
      </div>
    </div>

    <!-- URL bar -->
    <div v-if="showUrlBar" class="dt-url-bar mb-4">
      <div class="provider-filter-search" style="flex: 1">
        <span class="mdi mdi-link" />
        <input
          v-model="sourceUrl"
          class="provider-search-input"
          type="text"
          :placeholder="defaultSourceUrl"
          @keydown.enter="saveAndLoad"
        />
      </div>
      <SButton
        size="sm"
        :variant="urlChanged ? 'primary' : 'default'"
        :disabled="loading"
        @click="saveAndLoad"
      >
        <span class="mdi mdi-content-save mr-1" />{{ $t("shows.saveUrl") }}
      </SButton>
    </div>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />
    <SLoading v-if="loading && !items.length" />

    <div v-else-if="items.length" class="provider-grid">
      <MediaCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :cover-src="getCover(item)"
        :cover-loading="coverLoading.has(item.id)"
        :busy="busy"
        :downloaded-urls="downloadedUrls"
        :downloaded-hashes="downloadedHashes"
        @open="openModal"
        @download-link="onDownloadLink"
      />
    </div>

    <p v-else-if="!loading" class="has-text-muted">{{ $t("shows.empty") }}</p>

    <!-- Episode / detail modal -->
    <Teleport to="body">
      <div v-if="modal" class="dt-modal-overlay" @click.self="modal = null">
        <div class="dt-modal">
          <div class="dt-modal-header">
            <span class="dt-modal-title">{{ modal.item.title }}</span>
            <button class="dt-modal-close" @click="modal = null">
              <span class="mdi mdi-close" />
            </button>
          </div>
          <div class="dt-modal-body">
            <div class="dt-modal-top">
              <img
                v-if="getCover(modal.item)"
                :src="getCover(modal.item)!"
                class="dt-modal-cover"
                @error="onImgError"
              />
              <div class="dt-modal-meta">
                <div v-if="modal.item.date" class="media-meta-item">
                  <span class="mdi mdi-calendar" />{{ formatDate(modal.item.date) }}
                </div>
                <div v-if="modal.item.format" class="media-meta-item">
                  <span class="mdi mdi-quality-high" />{{ modal.item.format }}
                </div>
                <div v-if="modal.item.size" class="media-meta-item">
                  <span class="mdi mdi-harddisk" />{{ modal.item.size }}
                </div>
                <div v-if="modal.item.year" class="media-meta-item">
                  <span class="mdi mdi-filmstrip" />{{ modal.item.year }}
                </div>
                <div v-if="modal.item.genre" class="media-meta-item">
                  <span class="mdi mdi-tag" />{{ modal.item.genre }}
                </div>
                <div v-if="modal.item.episodes?.length" class="media-meta-item">
                  <span class="mdi mdi-television-play" />{{ modal.item.episodes.length }}
                  {{ $t("shows.episodes") }}
                </div>
              </div>
            </div>

            <SLoading v-if="detailLoading.has(modal.item.id)" class="mt-3" />

            <p v-if="modal.item.description" class="dt-modal-desc">
              {{ modal.item.description }}
            </p>

            <div v-if="modal.item.episodes?.length" class="dt-modal-episodes">
              <div
                v-for="(ep, i) in modal.item.episodes"
                :key="ep.code"
                class="episode-row"
                :class="{ 'is-loading': busy === ep.code, 'is-odd': i % 2 !== 0 }"
              >
                <span class="ep-code">{{ ep.code }}</span>
                <SButton
                  size="sm"
                  :variant="isEpDownloaded(ep) ? 'warning' : undefined"
                  :loading="busy === ep.code"
                  :disabled="!!busy"
                  @click="downloadEpisode(modal!.item, ep)"
                >
                  <span class="mdi mdi-download mr-1" />{{ $t("shows.download") }}
                </SButton>
                <span v-if="ep.date" class="ep-date">{{ ep.date }}</span>
              </div>
            </div>

            <div v-else-if="modal.item.links?.length" class="dt-modal-download">
              <SButton
                size="sm"
                :variant="isItemDownloaded(modal.item) ? 'warning' : undefined"
                :loading="busy === modal.item.id"
                :disabled="!!busy"
                @click="onDownloadLink(modal!.item, modal!.item.links![0])"
              >
                <span class="mdi mdi-download mr-1" />{{ $t("shows.addToTransmission") }}
              </SButton>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type {
  MediaItem,
  MediaLink,
  MediaEpisode,
  ProviderMeta,
  ProviderFilter,
} from "~/composables/useProviders";

const route = useRoute();
const { t } = useI18n();
const { apiFetch } = useApi();
const { loadProviders, fetchList, fetchDetail, fetchCover } = useProviders();
const { isDownloaded, isDownloadedByHash, recordDownload, loadDownloadHistory } =
  useDownloadHistory();

const providerId = computed(() => String(route.params.provider));
const mediaType = computed(() => "shows" as const);
const mediaTypeLabel = computed(() => t("shows.title"));

const providerMeta = ref<ProviderMeta | null>(null);
const filterDefs = ref<ProviderFilter[]>([]);
const textFilters = computed(() => filterDefs.value.filter((f) => f.type === "text"));
const selectFilters = computed(() => filterDefs.value.filter((f) => f.type === "select"));

const showUrlBar = computed(() => providerId.value.startsWith("dontorrent"));

const URL_DEFAULTS: Record<string, string> = {
  "dontorrent-shows": "https://www21.dontorrent.link/descargar-series",
};
const URL_PREF_KEYS: Record<string, string> = {
  "dontorrent-shows": "dontorrent_series_url",
};

const defaultSourceUrl = computed(() => URL_DEFAULTS[providerId.value] || "");
const sourceUrl = ref("");
const savedUrl = ref("");
const urlChanged = computed(() => sourceUrl.value.trim() !== savedUrl.value);

const items = ref<MediaItem[]>([]);
const loading = ref(false);
const error = ref("");
const busy = ref<string | null>(null);
const filters = reactive<Record<string, string>>({});

const detailLoading = ref(new Set<string>());
const coverLoading = ref(new Set<string>());
const coverCache = ref<Record<string, string | null>>({});

interface ModalState {
  item: MediaItem;
}
const modal = ref<ModalState | null>(null);

const downloadedUrls = computed(() => {
  const urls = useState<string[]>("_downloadedUrls");
  return urls.value ?? [];
});
const downloadedHashes = computed(() => {
  const hashes = useState<string[]>("_downloadedHashes");
  return hashes.value ?? [];
});

function getCover(item: MediaItem): string | null {
  if (item.cover) return item.cover;
  return coverCache.value[item.id] ?? null;
}

function isEpDownloaded(ep: MediaEpisode): boolean {
  return (
    ep.links?.some((l) => {
      if (l.url && isDownloaded(l.url)) return true;
      if (l.hash && isDownloadedByHash(l.hash)) return true;
      return false;
    }) ?? false
  );
}

function isItemDownloaded(item: MediaItem): boolean {
  return (
    item.links?.some((l) => {
      if (l.url && isDownloaded(l.url)) return true;
      if (l.hash && isDownloadedByHash(l.hash)) return true;
      return false;
    }) ?? false
  );
}

function formatDate(raw: string): string {
  if (!raw) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(raw));
  } catch {
    return raw;
  }
}

function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = "none";
}

let observer: IntersectionObserver | null = null;

async function loadItemDetail(item: MediaItem) {
  if (!item.needsDetail) return;
  if (detailLoading.value.has(item.id)) return;
  if ((item.links?.length ?? 0) > 0 || (item.episodes?.length ?? 0) > 0) return;

  const s = new Set(detailLoading.value);
  s.add(item.id);
  detailLoading.value = s;

  try {
    const detail = await fetchDetail(providerId.value, item.sourceUrl || item.id);
    if (detail) {
      const idx = items.value.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const merged = { ...items.value[idx], ...detail, id: item.id, needsDetail: false };
        items.value = [...items.value.slice(0, idx), merged, ...items.value.slice(idx + 1)];
        if (modal.value?.item.id === item.id) {
          modal.value = { item: merged };
        }
      }
    }
  } catch {
  } finally {
    const s2 = new Set(detailLoading.value);
    s2.delete(item.id);
    detailLoading.value = s2;
  }
}

async function loadItemCover(item: MediaItem) {
  if (item.cover) return;
  if (coverCache.value[item.id] !== undefined) return;
  if (coverLoading.value.has(item.id)) return;

  const s = new Set(coverLoading.value);
  s.add(item.id);
  coverLoading.value = s;

  try {
    const url = await fetchCover(providerId.value, item.title);
    coverCache.value = { ...coverCache.value, [item.id]: url };
  } catch {
    coverCache.value = { ...coverCache.value, [item.id]: null };
  } finally {
    const s2 = new Set(coverLoading.value);
    s2.delete(item.id);
    coverLoading.value = s2;
  }
}

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = (entry.target as HTMLElement).dataset.itemId;
        const item = items.value.find((m) => m.id === id);
        if (!item) return;
        observer!.unobserve(entry.target);
        if (item.needsDetail) loadItemDetail(item);
        if (!item.cover && providerMeta.value?.hasCover) loadItemCover(item);
      });
    },
    { rootMargin: "150px" },
  );
  nextTick(() => {
    document.querySelectorAll<HTMLElement>("[data-item-id]").forEach((el) => {
      observer!.observe(el);
    });
  });
}

function openModal(item: MediaItem) {
  modal.value = { item };
  if (item.needsDetail) loadItemDetail(item);
}

async function onDownloadLink(item: MediaItem, link: MediaLink | null) {
  if (busy.value) return;

  if (!link?.url && item.needsDetail) {
    busy.value = item.id;
    try {
      await loadItemDetail(item);
      const updated = items.value.find((i) => i.id === item.id);
      link = updated?.links?.[0] ?? null;
    } finally {
      if (!link?.url) {
        busy.value = null;
        error.value = t("shows.noTorrent");
        return;
      }
    }
  }

  if (!link?.url) {
    error.value = t("shows.noTorrent");
    return;
  }

  const key = link.hash || link.url;
  busy.value = key;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: link.url },
    });
    const title = link.quality ? `${item.title} [${link.quality}]` : item.title;
    recordDownload(link.url, title, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.addError");
  } finally {
    busy.value = null;
  }
}

async function downloadEpisode(item: MediaItem, ep: MediaEpisode) {
  if (busy.value) return;
  const link = ep.links?.[0];
  if (!link?.url) return;

  busy.value = ep.code;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: link.url },
    });
    recordDownload(link.url, `${item.title} ${ep.code}`, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.addError");
  } finally {
    busy.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  coverCache.value = {};
  observer?.disconnect();

  try {
    const params: Record<string, string | number> = { ...filters };
    if (showUrlBar.value && sourceUrl.value) {
      params.url = sourceUrl.value.trim();
    }

    const data = await fetchList(providerId.value, params);
    items.value = data.items ?? [];

    if (showUrlBar.value) {
      savedUrl.value = sourceUrl.value.trim();
      const prefKey = URL_PREF_KEYS[providerId.value];
      if (prefKey) {
        apiFetch("/api/preferences", {
          method: "PUT",
          body: { [prefKey]: sourceUrl.value.trim() },
        }).catch(() => {});
      }
    }

    setupObserver();
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.fetchError");
  } finally {
    loading.value = false;
  }
}

function saveAndLoad() {
  if (urlChanged.value) load();
}

onMounted(async () => {
  const auth = useAuth();
  const allProviders = await loadProviders();
  const meta = allProviders.find((p) => p.id === providerId.value);
  if (!meta) {
    error.value = `Provider "${providerId.value}" not found`;
    return;
  }
  providerMeta.value = meta;
  filterDefs.value = meta.filters;

  for (const f of meta.filters) {
    filters[f.key] = f.defaultValue ?? "";
  }

  if (showUrlBar.value) {
    sourceUrl.value = URL_DEFAULTS[providerId.value] || "";
    savedUrl.value = sourceUrl.value;
    try {
      const prefs = await apiFetch<Record<string, string>>("/api/preferences");
      const prefKey = URL_PREF_KEYS[providerId.value];
      if (prefKey && prefs?.[prefKey]) {
        sourceUrl.value = prefs[prefKey];
        savedUrl.value = prefs[prefKey];
      }
    } catch {
      if (!auth.token.value) return;
    }
  }

  await loadDownloadHistory();
  load();
});

onUnmounted(() => observer?.disconnect());
</script>

<style scoped>
.provider-filters {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.provider-filters-selects {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}

.provider-filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.provider-filter-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--s-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.provider-filter-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;

  .mdi-magnify,
  .mdi-link {
    position: absolute;
    left: 0.55rem;
    color: var(--s-text-muted);
    font-size: 0.95rem;
    pointer-events: none;
  }
}

.provider-search-input {
  width: 100%;
  padding: 0.35rem 1.8rem 0.35rem 1.8rem;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  background: var(--s-bg-surface);
  color: var(--s-text);
  font-size: 0.84rem;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: var(--s-accent);
  }
  &::placeholder {
    color: var(--s-text-muted);
  }
}

.provider-search-clear {
  position: absolute;
  right: 0.4rem;
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-muted);
  padding: 0;
  font-size: 0.9rem;

  &:hover {
    color: var(--s-accent);
  }
}

.dt-url-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 540px) {
    grid-template-columns: 1fr;
  }
}

/* Modal */
.dt-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.dt-modal {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius-lg);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dt-modal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}

.dt-modal-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--s-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dt-modal-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-muted);
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.2rem;
  border-radius: var(--s-radius);

  &:hover {
    color: var(--s-text);
    background: var(--s-bg-muted);
  }
}

.dt-modal-body {
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dt-modal-top {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.dt-modal-cover {
  width: 90px;
  height: 130px;
  object-fit: contain;
  object-position: left center;
  flex-shrink: 0;
  border-radius: var(--s-radius);
  background: var(--s-bg-muted);
}

.dt-modal-meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
}

.media-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;

  .mdi {
    opacity: 0.7;
    font-size: 0.85rem;
  }
}

.dt-modal-desc {
  font-size: 0.84rem;
  color: var(--s-text-secondary);
  line-height: 1.6;
  margin: 0;
}

.dt-modal-episodes {
  border-top: 1px solid var(--s-border);
  padding-top: 0.5rem;
}

.dt-modal-download {
  border-top: 1px solid var(--s-border);
  padding-top: 0.75rem;
}

.episode-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.82rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--s-radius);
  background: transparent;

  &.is-odd {
    background: var(--s-bg-muted);
  }
  &.is-loading {
    opacity: 0.6;
    pointer-events: none;
  }
}

.ep-code {
  font-weight: 600;
  color: var(--s-text);
  min-width: 3rem;
  flex-shrink: 0;
}

.ep-date {
  color: var(--s-text-muted);
  font-size: 0.72rem;
  margin-left: auto;
  flex-shrink: 0;
}
</style>
