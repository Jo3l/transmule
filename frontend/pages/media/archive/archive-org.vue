<template>
  <div id="page-archive-org">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-archive mr-1" />
      Archive.org Search
    </h1>

    <!-- Search form: query + filters + button -->
    <div class="box mb-4">
      <form @submit.prevent="onSearch">
        <div class="archive-search-row">
          <SInput
            v-model="query"
            placeholder="Search Archive.org..."
            class="archive-search-input"
            autofocus
          >
            <template #prefix><span class="mdi mdi-magnify" /></template>
          </SInput>
          <SButton variant="primary" native-type="submit" class="archive-search-btn">
            <span class="mdi mdi-magnify mr-1" /> {{ $t("search.button") }}
          </SButton>
        </div>
        <div class="archive-filters-row">
          <div v-if="mediatypeFilter" class="archive-filter-group">
            <label class="archive-filter-label">{{ mediatypeFilter.label }}</label>
            <SSelect v-model="filterValues.mediatype" :options="mediatypeFilter.options || []" />
          </div>
          <div v-if="languageFilter" class="archive-filter-group">
            <label class="archive-filter-label">{{ languageFilter.label }}</label>
            <SSelect v-model="filterValues.language" :options="languageFilter.options || []" />
          </div>
          <div v-if="sortFilter" class="archive-filter-group">
            <label class="archive-filter-label">{{ sortFilter.label }}</label>
            <SSelect v-model="filterValues.sort" :options="sortFilter.options || []" />
          </div>
        </div>
      </form>
    </div>

    <!-- ═══ Tabs ═══════════════════════════════════════════════ -->
    <STabs v-if="archiveTabs.length > 0" v-model="currentTabName" variant="card" :panes="tabPanes">
      <template v-for="tab in archiveTabs" :key="tab.id" #[`tab-${tab.id}`]>
        <span class="tab-label-wrap">
          <span v-if="tab.status === 'searching'" class="mdi mdi-loading mdi-spin tab-status-icon" />
          <span v-else-if="tab.status === 'complete'" class="mdi mdi-check tab-status-icon has-text-success" />
          <span v-else-if="tab.status === 'error'" class="mdi mdi-alert tab-status-icon has-text-danger" />
          <span class="tab-label-text">{{ tab.query }}</span>
          <span class="tab-count-badge">{{ tab.results.length }}</span>
          <button class="tab-close-btn" title="Close tab" @click.stop="closeTab(tab.id)">
            <span class="mdi mdi-close" />
          </button>
        </span>
      </template>

      <STabPane
        v-for="tab in archiveTabs"
        :key="tab.id"
        :name="tab.id"
        :label="tab.query"
        :active="tab.id === (activeTabId ?? '')"
      >
        <div v-if="tab.status === 'searching'" class="mb-2">
          <span class="is-size-7 has-text-grey">
            <span class="mdi mdi-loading mdi-spin mr-1" />
            {{ tab.results.length ? $t("search.resultsCount", { count: tab.results.length }) : $t("search.searching") }}
          </span>
        </div>
        <div v-else-if="tab.status === 'complete' && tab.results.length > 0" class="mb-2 is-size-7 has-text-grey has-text-centered">
          {{ $t("search.resultsCount", { count: tab.results.length }) }}
        </div>

        <p v-if="tab.error" class="has-text-danger mt-3 mb-3">{{ tab.error }}</p>

        <SLoading v-if="tab.status === 'searching' && !tab.results.length" />
        <p v-else-if="tab.status === 'complete' && !tab.results.length" class="has-text-muted">
          {{ $t("media.empty") }}
        </p>

        <div v-if="tab.results.length" class="provider-grid">
          <MediaCard
            v-for="item in tab.results"
            :key="item.id"
            :item="item"
            :cover-src="getCover(item)"
            @open="openModal"
          />
        </div>

        <!-- Pagination -->
        <div v-if="tab.total > 0" class="provider-pagination">
          <SButton size="sm" :disabled="tab.page <= 1 || tab.status === 'searching'" @click="goToPage(tab.id, tab.page - 1)">
            <span class="mdi mdi-chevron-left" /> {{ $t("media.prevPage") }}
          </SButton>
          <span class="provider-page-num">{{ $t("media.page", { n: tab.page }) }}</span>
          <SButton size="sm" :disabled="!tab.hasMore || tab.status === 'searching'" @click="goToPage(tab.id, tab.page + 1)">
            {{ $t("media.nextPage") }} <span class="mdi mdi-chevron-right" />
          </SButton>
        </div>
      </STabPane>
    </STabs>

    <div v-else class="has-text-centered py-5 has-text-grey">
      <span class="mdi mdi-file-search-outline icon-lg" />
      <p>{{ $t("search.enterTermBoth") }}</p>
    </div>

    <!-- File detail modal -->
    <div v-if="modal" class="dt-modal-overlay" @click.self="modal = null">
      <div class="dt-modal">
        <div class="dt-modal-header">
          <span class="dt-modal-title">{{ modal.item.title }}</span>
          <button class="dt-modal-close" @click="modal = null"><span class="mdi mdi-close" /></button>
        </div>
        <div class="dt-modal-body">
          <div class="dt-modal-top">
            <img v-if="getCover(modal.item)" :src="getCover(modal.item)!" class="dt-modal-cover" @error="onImgError" />
            <div class="dt-modal-meta">
              <div v-if="modal.item.date" class="media-meta-item"><span class="mdi mdi-calendar" />{{ formatDate(modal.item.date) }}</div>
              <div v-if="modal.item.format" class="media-meta-item"><span class="mdi mdi-quality-high" />{{ modal.item.format }}</div>
              <div v-if="modal.item.size" class="media-meta-item"><span class="mdi mdi-harddisk" />{{ modal.item.size }}</div>
              <div v-if="modal.item.year" class="media-meta-item"><span class="mdi mdi-filmstrip" />{{ modal.item.year }}</div>
              <div v-if="modal.item.genre" class="media-meta-item"><span class="mdi mdi-tag" />{{ modal.item.genre }}</div>
            </div>
          </div>
          <p v-if="modal.item.description" class="dt-modal-desc">{{ modal.item.description }}</p>

          <div v-if="!modal.item.episodes?.length && (modal.item.links?.length || detailLoading.has(modal.item.id))" class="dt-modal-download">
            <div v-if="detailLoading.has(modal.item.id)" class="dt-modal-files-loading">
              <span class="mdi mdi-loading mdi-spin dt-modal-files-spinner" /><span>Loading files…</span>
            </div>
            <template v-else>
              <div v-for="link in modal.item.links" :key="link.hash || link.url" class="dt-modal-torrent-row">
                <span class="torrent-filename" :title="link.label">{{ link.label }}</span>
                <span v-if="link.quality" class="torrent-quality">{{ link.quality }}</span>
                <span v-if="link.type" class="torrent-type">{{ link.type }}</span>
                <span v-if="link.size" class="torrent-size">{{ link.size }}</span>
                <DownloadButton size="sm" :service="link.service || 'transmission'" :url="link.url" :hash="link.hash" :title="link.quality ? `${modal!.item.title} [${link.quality}]` : modal!.item.title" :label="$t('media.download')" />
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PageCache {
  items: any[];
  total: number;
  hasMore: boolean;
}

interface ArchiveTab {
  id: string;
  query: string;
  filters: Record<string, string>;
  status: "idle" | "searching" | "complete" | "error";
  results: any[];
  total: number;
  page: number;
  hasMore: boolean;
  error?: string;
}

const { t } = useI18n();
const { apiFetch } = useApi();
const { loadProviders, fetchDetail } = useProviders();

// ── Provider meta & filters ──────────────────────────────

const providerFilters = ref<{ key: string; label: string; type: string; options?: { label: string; value: string }[] }[]>([]);

const mediatypeFilter = computed(() => providerFilters.value.find((f) => f.key === "mediatype"));
const languageFilter = computed(() => providerFilters.value.find((f) => f.key === "language"));
const sortFilter = computed(() => providerFilters.value.find((f) => f.key === "sort"));

// ── Form state ───────────────────────────────────────────

const query = ref("");
const filterValues = reactive<Record<string, string>>({});

// ── Persistent tab state (survives route navigation) ────

const archiveTabs = useState<ArchiveTab[]>("archiveOrgTabs", () => []);
const activeTabId = useState<string | null>("archiveOrgActiveTab", () => null);
let tabCounter = 0;

// Page cache per tab (non-persistent, ephemeral per mount)
// tabId → { page → { items, total, hasMore } }
const pageCaches = ref<Record<string, Record<number, PageCache>>>({});

const currentTabName = computed({
  get: () => activeTabId.value ?? "",
  set: (val: string) => { activeTabId.value = val; },
});

const tabPanes = computed(() =>
  archiveTabs.value.map((t) => ({ name: t.id, label: t.query })),
);

// ── Detail loading state ────────────────────────────────

const detailLoading = ref(new Set<string>());

// ── Modal ────────────────────────────────────────────────

interface ModalState {
  item: any;
}
const modal = ref<ModalState | null>(null);

// ── Helpers ──────────────────────────────────────────────

function getCover(item: any): string | null {
  return item.cover ?? null;
}

function formatDate(raw: string): string {
  if (!raw) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "short", day: "numeric",
    }).format(new Date(raw));
  } catch { return raw; }
}

function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = "none";
}

// ── Tab CRUD ─────────────────────────────────────────────

function createTab(searchQuery: string, filters: Record<string, string>) {
  tabCounter++;
  const id = `archive_${Date.now()}_${tabCounter}`;

  const tab: ArchiveTab = {
    id, query: searchQuery, filters: { ...filters },
    status: "searching", results: [], total: 0,
    page: 1, hasMore: false,
  };

  archiveTabs.value.push(tab);
  activeTabId.value = id;

  // Initialize page cache for this tab
  pageCaches.value = { ...pageCaches.value, [id]: {} };

  fetchPage(tab, 1);
}

function closeTab(id: string) {
  archiveTabs.value = archiveTabs.value.filter((t) => t.id !== id);
  // Clean up page cache to avoid memory leak
  const { [id]: _, ...rest } = pageCaches.value;
  pageCaches.value = rest;
  if (activeTabId.value === id) {
    activeTabId.value = archiveTabs.value.length > 0
      ? archiveTabs.value[archiveTabs.value.length - 1].id
      : null;
  }
}

// ── Page fetching with cache + preload ───────────────────

async function fetchPage(tab: ArchiveTab, page: number) {
  const qs = new URLSearchParams();
  qs.set("id", "archive-org");
  qs.set("query", tab.query);
  qs.set("limit", "50");
  qs.set("page", String(page));
  for (const [k, v] of Object.entries(tab.filters)) {
    if (v) qs.set(k, v);
  }

  try {
    const data = await apiFetch<any>(`/api/providers/list?${qs.toString()}`);
    const items = data?.items ?? [];
    const total = data?.total ?? items.length;
    const hasMore = data?.hasMore ?? false;

    // Store in page cache
    const tabCache = { ...(pageCaches.value[tab.id] || {}) };
    tabCache[page] = { items, total, hasMore };
    pageCaches.value = { ...pageCaches.value, [tab.id]: tabCache };

    // Update tab state
    const idx = archiveTabs.value.findIndex((t) => t.id === tab.id);
    if (idx >= 0) {
      archiveTabs.value[idx] = {
        ...archiveTabs.value[idx],
        results: items, total, page, hasMore,
        status: "complete",
      };
    }

    // Preload next page in background
    if (hasMore && !tabCache[page + 1]) {
      preloadPage(tab, page + 1);
    }
  } catch (err: any) {
    const idx = archiveTabs.value.findIndex((t) => t.id === tab.id);
    if (idx >= 0) {
      archiveTabs.value[idx] = {
        ...archiveTabs.value[idx],
        status: "error",
        error: err?.data?.statusMessage || err?.message || "Search failed",
      };
    }
  }
}

async function preloadPage(tab: ArchiveTab, page: number) {
  // Don't preload if already cached or if tab is gone
  if (pageCaches.value[tab.id]?.[page]) return;
  const exists = archiveTabs.value.some((t) => t.id === tab.id);
  if (!exists) return;

  const qs = new URLSearchParams();
  qs.set("id", "archive-org");
  qs.set("query", tab.query);
  qs.set("limit", "50");
  qs.set("page", String(page));
  for (const [k, v] of Object.entries(tab.filters)) {
    if (v) qs.set(k, v);
  }

  try {
    const data = await apiFetch<any>(`/api/providers/list?${qs.toString()}`);
    const items = data?.items ?? [];
    const total = data?.total ?? items.length;
    const hasMore = data?.hasMore ?? false;

    const tabCache = { ...(pageCaches.value[tab.id] || {}) };
    tabCache[page] = { items, total, hasMore };
    pageCaches.value = { ...pageCaches.value, [tab.id]: tabCache };
  } catch {
    // Silent — preload failures are non-critical
  }
}

// ── Search trigger ───────────────────────────────────────

function onSearch() {
  if (!query.value.trim()) return;
  createTab(query.value.trim(), { ...filterValues });
  query.value = "";
}

// ── Pagination ───────────────────────────────────────────

function goToPage(tabId: string, page: number) {
  if (page < 1) return;
  const tab = archiveTabs.value.find((t) => t.id === tabId);
  if (!tab) return;

  const cache = pageCaches.value[tabId]?.[page];
  if (cache) {
    // Restore from cache — instant, no fetch
    const idx = archiveTabs.value.findIndex((t) => t.id === tabId);
    if (idx >= 0) {
      archiveTabs.value[idx] = {
        ...archiveTabs.value[idx],
        results: cache.items,
        total: cache.total,
        page,
        hasMore: cache.hasMore,
        status: "complete",
      };
    }
    // Ensure next page is preloaded
    if (cache.hasMore && !pageCaches.value[tabId]?.[page + 1]) {
      preloadPage(tab, page + 1);
    }
  } else {
    // Not in cache — fetch
    const idx = archiveTabs.value.findIndex((t) => t.id === tabId);
    if (idx >= 0) {
      archiveTabs.value[idx] = { ...archiveTabs.value[idx], status: "searching" };
    }
    fetchPage(tab, page);
  }
}

// ── Modal ────────────────────────────────────────────────

function openModal(item: any) {
  modal.value = { item };
  if (item.needsDetail) loadItemDetail(item);
}

// ── Detail lazy loading ──────────────────────────────────

async function loadItemDetail(item: any) {
  if (!item.needsDetail) return;
  if (detailLoading.value.has(item.id)) return;
  if ((item.links?.length ?? 0) > 0 || (item.episodes?.length ?? 0) > 0) return;

  const s = new Set(detailLoading.value);
  s.add(item.id);
  detailLoading.value = s;

  try {
    const detail = await fetchDetail("archive-org", item.sourceUrl || item.id);
    if (!detail) return;

    for (let i = 0; i < archiveTabs.value.length; i++) {
      const tab = archiveTabs.value[i];
      const idx = tab.results.findIndex((r: any) => r.id === item.id);
      if (idx >= 0) {
        const merged = { ...tab.results[idx], ...detail, id: item.id };
        tab.results.splice(idx, 1, merged);
        archiveTabs.value[i] = { ...tab, results: [...tab.results] };
        break;
      }
    }

    if (modal.value?.item.id === item.id) {
      await nextTick();
      if (modal.value?.item.id === item.id) {
        const updated = archiveTabs.value
          .flatMap((t) => t.results)
          .find((r: any) => r.id === item.id);
        if (updated) modal.value = { item: updated };
      }
    }
  } catch {
    // silently ignore
  } finally {
    const s2 = new Set(detailLoading.value);
    s2.delete(item.id);
    detailLoading.value = s2;
  }
}

// ── Init ─────────────────────────────────────────────────

onMounted(async () => {
  const allProviders = await loadProviders();
  const meta = allProviders.find((p) => p.id === "archive-org");
  if (meta?.filters) {
    providerFilters.value = meta.filters;
    for (const f of meta.filters) {
      if (f.defaultValue !== undefined) {
        filterValues[f.key] = f.defaultValue;
      }
    }
  }

  // Initialize page caches for any restored tabs
  for (const tab of archiveTabs.value) {
    if (!pageCaches.value[tab.id]) {
      pageCaches.value = { ...pageCaches.value, [tab.id]: {} };
    }
    // Restore current page into cache so goToPage can navigate back
    const tabCache = { ...(pageCaches.value[tab.id] || {}) };
    tabCache[tab.page] = { items: tab.results, total: tab.total, hasMore: tab.hasMore };
    pageCaches.value = { ...pageCaches.value, [tab.id]: tabCache };
    // Preload next page if tab hasMore
    if (tab.hasMore && !tabCache[tab.page + 1] && tab.results.length > 0) {
      preloadPage(tab, tab.page + 1);
    }
  }

});
</script>

<style scoped>
.archive-search-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}
.archive-search-input { flex: 1; min-width: 150px; }
.archive-search-btn { flex-shrink: 0; }

.archive-filters-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}
.archive-filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 160px;
  flex: 1;
}
.archive-filter-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--s-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

/* ── Tab custom slot ────────────────────────────────── */
.tab-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.tab-status-icon { font-size: 0.7rem; }
.tab-label-text { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.tab-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px; height: 18px;
  padding: 0 5px;
  font-size: 0.6rem; font-weight: 700;
  border-radius: 9px;
  background: var(--s-border);
  color: var(--s-text-secondary);
}
.tab-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px; height: 16px;
  border: none; background: transparent;
  cursor: pointer; border-radius: 3px;
  font-size: 0.6rem;
  color: var(--s-text-secondary);
  opacity: 0.5;
  transition: opacity 0.15s;
  padding: 0;
}
.tab-close-btn:hover {
  opacity: 1;
  background: var(--s-border);
  color: var(--s-danger);
}

/* ── MediaCard grid ────────────────────────────────── */
.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
@media (max-width: 900px) {
  .provider-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 540px) {
  .provider-grid { grid-template-columns: 1fr; }
}

/* ── Pagination ────────────────────────────────────── */
.provider-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
}
.provider-page-num {
  font-size: 0.85rem;
  color: var(--s-text-secondary);
  min-width: 4rem;
  text-align: center;
}

/* ── Modal styles ──────────────────────────────────── */
.dt-modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.dt-modal {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius-lg);
  width: 100%; max-width: 55vw; max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
}
@media (max-width: 540px) {
  .dt-modal { max-width: 100vw; }
}
.dt-modal-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}
.dt-modal-title {
  font-weight: 700; font-size: 1rem; color: var(--s-text);
  flex: 1; min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.dt-modal-close {
  flex-shrink: 0; background: none; border: none; cursor: pointer;
  color: var(--s-text-muted); font-size: 1.1rem; line-height: 1;
  padding: 0.2rem; border-radius: var(--s-radius);
}
.dt-modal-close:hover { color: var(--s-text); background: var(--s-bg-muted); }
.dt-modal-body {
  overflow-y: auto; padding: 1rem;
  display: flex; flex-direction: column; gap: 0.75rem;
}
.dt-modal-top { display: flex; gap: 0.75rem; align-items: flex-start; }
.dt-modal-cover {
  width: 90px; height: 130px;
  object-fit: contain; object-position: left center;
  flex-shrink: 0; border-radius: var(--s-radius);
  background: var(--s-bg-muted);
}
.dt-modal-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.media-meta-item {
  display: inline-flex; align-items: center; gap: 0.2rem;
  font-size: 0.78rem; color: var(--s-text-secondary);
}
.media-meta-item .mdi { opacity: 0.7; font-size: 0.85rem; }
.dt-modal-desc {
  font-size: 0.85rem; color: var(--s-text-secondary);
  line-height: 1.6; max-height: 5rem; overflow-y: auto;
}
.dt-modal-download { display: flex; flex-direction: column; gap: 0.4rem; }
.dt-modal-files-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 0.5rem; padding: 1rem;
  color: var(--s-text-muted); font-size: 0.85rem;
}
.dt-modal-files-spinner { font-size: 1.2rem; }
.dt-modal-torrent-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  background: var(--s-bg-muted);
  border-radius: var(--s-radius);
  font-size: 0.82rem; flex-wrap: wrap;
}
.torrent-filename {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 500; color: var(--s-text);
}
.torrent-quality { font-weight: 600; color: var(--s-text); min-width: 3rem; }
.torrent-type { color: var(--s-text-muted); min-width: 3.5rem; text-transform: capitalize; }
.torrent-size { color: var(--s-text-secondary); min-width: 4rem; }
.dt-modal-torrent-row :deep(.s-button) { flex-shrink: 0; }

@media (max-width: 640px) {
  .archive-search-row { gap: 1rem; flex-wrap: wrap; }
  .archive-search-input { flex: 0 0 100%; }
  .archive-search-btn { width: 100%; }
  .archive-filters-row { gap: 1rem; }
  .archive-filter-group { min-width: 0; flex: 1; }
}
</style>
