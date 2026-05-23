<template>
  <div id="page-unified-search">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-magnify mr-1" />
      Búsqueda global
    </h1>

    <!-- Search form: input + source select + button -->
    <div class="box mb-4">
      <form @submit.prevent="onSearch" class="unified-search-form">
        <SInput
          v-model="query"
          placeholder="Título de película, serie…"
          class="unified-search-input"
          autofocus
        >
          <template #prefix><span class="mdi mdi-magnify" /></template>
        </SInput>
        <SSelect v-model="searchSource" :options="sourceOptions" class="unified-search-source" />
        <SButton variant="primary" native-type="submit" class="unified-search-btn">
          <span class="mdi mdi-magnify mr-1" /> Buscar
        </SButton>
      </form>
    </div>

    <!-- ═══ Tabs ═══════════════════════════════════════════════ -->
    <STabs v-if="unifiedTabs.length > 0" v-model="currentTabName" variant="card" :panes="tabPanes">
      <template v-for="tab in unifiedTabs" :key="tab.id" #[`tab-${tab.id}`]>
        <span class="tab-label-wrap">
          <span
            v-if="tab.status === 'searching'"
            class="mdi mdi-loading mdi-spin tab-status-icon"
          />
          <span
            v-else-if="tab.status === 'complete'"
            class="mdi mdi-check tab-status-icon has-text-success"
          />
          <span
            v-else-if="tab.status === 'error'"
            class="mdi mdi-alert tab-status-icon has-text-danger"
          />
          <span class="tab-label-text">{{ tab.query }}</span>
          <span class="tab-count-badge">{{ tab.results.length }}</span>
          <button class="tab-close-btn" title="Cerrar" @click.stop="closeTab(tab.id)">
            <span class="mdi mdi-close" />
          </button>
        </span>
      </template>

      <STabPane
        v-for="tab in unifiedTabs"
        :key="tab.id"
        :name="tab.id"
        :label="tab.query"
        :active="tab.id === (activeTabId ?? '')"
      >
        <!-- Status bar -->
        <div v-if="tab.status === 'searching'" class="mb-2">
          <span class="is-size-7 has-text-grey">
            <span class="mdi mdi-loading mdi-spin mr-1" />
            Buscando{{ tab.results.length ? ` (${tab.results.length} resultados)` : "…" }}
          </span>
        </div>
        <div
          v-else-if="tab.status === 'complete' && tab.results.length > 0"
          class="mb-2 is-size-7 has-text-grey has-text-centered"
        >
          {{ tab.results.length }} resultados
          <span v-if="tab.results.filter((r: any) => r.type === 'torrent').length" class="ml-2">
            <span class="mdi mdi-magnet" />
            {{ tab.results.filter((r: any) => r.type === "torrent").length }}
          </span>
          <span v-if="tab.results.filter((r: any) => r.type === 'amule').length" class="ml-2">
            <span class="mdi mdi-server-network" />
            {{ tab.results.filter((r: any) => r.type === "amule").length }}
          </span>
        </div>

        <p v-if="tab.error" class="has-text-danger mt-3 mb-3">{{ tab.error }}</p>

        <STable :data="pagedResults" :columns="columns" row-key="id" @sort="onSort">
          <!-- Name header with filter -->
          <template #header-name="{ column }">
            <SearchFilterHeader v-model="nameFilter" :label="column.label" placeholder="filtrar…" />
          </template>

          <!-- Cover -->
          <template #cell-cover="{ row }">
            <ResultCover
              v-if="isVideoExt(row.name)"
              :cover="row.cover"
              :name="row.name"
              :size="row.size_fmt"
              :seeders="row.type === 'torrent' ? row.seedsOrSources : undefined"
              :leechers="row.type === 'torrent' ? row.leechers : undefined"
              :category="row.category"
              :movie-details="row.movieDetails"
              @load-cover="loadCover(tab.id, row)"
            />
            <span v-else class="result-cover-placeholder" :title="row.name">
              <span :class="['mdi result-cover-icon', detectFileIcon(row.name)]" />
            </span>
          </template>

          <!-- Name -->
          <template #cell-name="{ row }">
            <SearchResultName :name="row.name" :tags="row.tags" />
          </template>

          <!-- Seeds / Sources -->
          <template #cell-seeds="{ row }">
            <span
              v-if="row.seedsOrSources != null"
              :class="row.seedsOrSources > 0 ? 'has-text-success' : 'has-text-grey'"
              >{{ row.seedsOrSources }}</span
            >
          </template>

          <!-- Leechers (torrent only) -->
          <template #cell-leechers="{ row }">
            <span
              v-if="row.type === 'torrent' && row.leechers != null"
              :class="row.leechers > 0 ? 'has-text-danger' : 'has-text-grey'"
              >{{ row.leechers }}</span
            >
          </template>

          <!-- Source -->
          <template #header-source="{ column }">
            <SButton size="mini" @click.stop="toggleSourceFilter($event)">
              <span class="mdi mdi-filter-variant" />
            </SButton>
            <Teleport to="body">
              <div
                v-if="showSourceFilter"
                class="source-filter-dropdown"
                :style="sourceFilterStyle"
                @click.stop
              >
                <label v-for="src in sortedSources" :key="src" class="source-filter-item">
                  <SCheckbox
                    :model-value="activeSourceFilters?.has(src) ?? false"
                    @update:model-value="toggleSource(src)"
                  />
                  <span class="source-filter-label">{{ src }}</span>
                </label>
                <div class="source-filter-actions">
                  <SButton size="sm" @click="selectAllSources">Todo</SButton>
                  <SButton size="sm" @click="clearAllSources">Ninguno</SButton>
                </div>
              </div>
            </Teleport>
          </template>
          <template #cell-source="{ row }">
            <STag :variant="row.type === 'amule' ? 'accent' : 'info'" size="sm">
              <span v-if="row.type === 'amule'" class="mdi mdi-server-network mr-1" />
              <span v-else class="mdi mdi-magnet mr-1" />
              {{ row.source }}
            </STag>
          </template>

          <!-- Actions -->
          <template #cell-actions="{ row }">
            <DownloadButton
              v-if="row.downloadUrl"
              service="pyload"
              :url="row.downloadUrl"
              :title="row.name"
            />
            <DownloadButton
              v-else-if="row.type === 'torrent'"
              service="transmission"
              :url="row.magnet"
              :hash="row.infoHash"
              :title="row.name"
            />
            <DownloadButton v-else service="amule" :hash="row.hash" hide-when-downloaded />
          </template>

          <template #empty>
            <div class="has-text-centered py-5 has-text-grey">
              <span class="mdi mdi-file-search-outline icon-lg" />
              <p v-if="tab.status === 'searching'">Buscando resultados…</p>
              <p v-else>Sin resultados para "{{ tab.query }}"</p>
            </div>
          </template>
        </STable>

        <SPagination
          v-if="totalFiltered > PAGE_SIZE"
          v-model="currentPage"
          :total="totalFiltered"
          :page-size="PAGE_SIZE"
          class="mt-2"
        />
      </STabPane>
    </STabs>

    <!-- No tabs yet -->
    <div v-else class="has-text-centered py-5 has-text-grey">
      <span class="mdi mdi-file-search-outline icon-lg" />
      <p>Introduce un término para buscar en ambos servicios</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isVideoExt, detectFileIcon } from "../composables/useSearchTabs";

const route = useRoute();
const { torrentSearchProviders, loadProviders } = useProviders();

const { tabs, activeTabId, createUnifiedTab, closeTab, switchTab } = useSearchTabs();

// ── Load providers on mount ────────────────────────────────

// ── Filter tabs by service ──────────────────────────────────

const unifiedTabs = computed(() => tabs.value.filter((t: any) => t.service === "unified"));

// ── Form state ──────────────────────────────────────────────

const query = ref("");
const searchSource = ref("all");

const sourceOptions = computed(() => {
  const opts: { label: string; value: string }[] = [{ label: "Todos los plugins", value: "all" }];
  for (const p of torrentSearchProviders.value) {
    opts.push({ label: p.name, value: p.id });
  }
  return opts;
});

// ── Source filter (per-search, column filter) ──────────────
const showSourceFilter = ref(false);
const activeSourceFilters = ref<Set<string> | null>(null);
const sourceFilterTriggerEl = ref<HTMLElement | null>(null);

const allSources = computed(() => {
  const s = new Set<string>();
  const tab = activeUnifiedTab.value;
  if (tab?.results) {
    for (const r of tab.results) s.add(r.source);
  }
  return s;
});

const sortedSources = computed(() => [...allSources.value].sort());

const sourceFilterStyle = computed(() => {
  if (!sourceFilterTriggerEl.value) return { top: "0", left: "0", display: "none" };
  const rect = sourceFilterTriggerEl.value.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ddWidth = 240; // approximate dropdown width
  const ddHeight = 300; // approximate max dropdown height

  let top = rect.bottom + 4;
  let left = rect.left;

  // Ensure dropdown doesn't go off the right edge
  if (left + ddWidth > vw - 8) {
    left = vw - ddWidth - 8;
  }
  // Ensure dropdown doesn't go off the left edge
  if (left < 8) left = 8;
  // If dropdown would go below viewport, open upward
  if (top + ddHeight > vh - 8 && rect.top > ddHeight) {
    top = rect.top - ddHeight - 4;
  }
  // Ensure top isn't off-screen
  if (top < 8) top = 8;

  return { top: `${top}px`, left: `${left}px` };
});

function toggleSourceFilter(e: MouseEvent) {
  showSourceFilter.value = !showSourceFilter.value;
  if (showSourceFilter.value) {
    sourceFilterTriggerEl.value = e.currentTarget as HTMLElement;
    // Initialize with all sources when first opening
    if (activeSourceFilters.value === null) {
      activeSourceFilters.value = new Set(allSources.value);
    }
  }
}

function toggleSource(src: string) {
  if (activeSourceFilters.value === null) return;
  const s = new Set(activeSourceFilters.value);
  if (s.has(src)) s.delete(src);
  else s.add(src);
  activeSourceFilters.value = s;
}

function selectAllSources() {
  activeSourceFilters.value = new Set(allSources.value);
}
function clearAllSources() {
  activeSourceFilters.value = new Set();
}

// ── Tab panes ───────────────────────────────────────────────

const currentTabName = computed({
  get: () => activeTabId.value ?? "",
  set: (val: string) => switchTab(val),
});

const tabPanes = computed(() =>
  unifiedTabs.value.map((t: any) => ({ name: t.id, label: t.query })),
);

// ── Name filter + pagination ────────────────────────────────

const nameFilter = ref("");
const currentPage = ref(1);

const activeUnifiedTab = computed(() => {
  const id = activeTabId.value;
  if (!id) return null;
  return unifiedTabs.value.find((t: any) => t.id === id) ?? null;
});

const filteredResults = computed(() => {
  if (!activeUnifiedTab.value) return [];
  let results = (activeUnifiedTab.value as any).results ?? [];

  // Name filter
  if (nameFilter.value) {
    const q = nameFilter.value.toLowerCase();
    results = results.filter((r: any) => r.name.toLowerCase().includes(q));
  }

  // Source filter
  if (activeSourceFilters.value !== null) {
    results = results.filter((r: any) => activeSourceFilters.value!.has(r.source));
  }

  return results;
});

// ── Columns ─────────────────────────────────────────────────

const PAGE_SIZE = 50;

const sortField = ref("");
const sortDir = ref<"asc" | "desc">("asc");

const columns = [
  { key: "cover", label: "", width: 50, align: "center" as const },
  { prop: "name", label: "Nombre", sortable: true },
  { prop: "size_fmt", sortProp: "size", label: "Tamaño", width: 70, sortable: true },
  {
    key: "seeds",
    prop: "seedsOrSources",
    label: "SE",
    width: 50,
    sortable: true,
    align: "right" as const,
  },
  {
    key: "leechers",
    prop: "leechers",
    label: "LE",
    width: 50,
    sortable: true,
    align: "right" as const,
  },
  { key: "source", label: "Fuente", width: 90, sortable: true, align: "center" as const },
  { key: "actions", label: "", width: 78, align: "center" as const },
];

/** Sort the full filtered list before pagination. */
const sortedResults = computed(() => {
  const data = filteredResults.value;
  if (!sortField.value || !data.length) return data;
  const dir = sortDir.value === "asc" ? 1 : -1;
  const p = sortField.value;
  return [...data].sort((a: any, b: any) => {
    const va = a[p];
    const vb = b[p];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

const pagedResults = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return sortedResults.value.slice(start, start + PAGE_SIZE);
});

const totalFiltered = computed(() => filteredResults.value.length);

watch(nameFilter, () => {
  currentPage.value = 1;
});
watch(filteredResults, () => {
  if (currentPage.value > Math.ceil(filteredResults.value.length / PAGE_SIZE)) {
    currentPage.value = Math.max(1, Math.ceil(filteredResults.value.length / PAGE_SIZE));
  }
});

function onSort(field: string, dir: "asc" | "desc") {
  sortField.value = field;
  sortDir.value = dir;
}

// ── Search ──────────────────────────────────────────────────

function onSearch() {
  if (!query.value.trim()) return;
  createUnifiedTab(query.value.trim(), searchSource.value);
  // Reset source filters for the new search
  activeSourceFilters.value = null;
  query.value = "";
}

// ── Cover loading ───────────────────────────────────────────

async function loadCover(tabId: string, row: any) {
  if (row.cover && row.movieDetails) return;
  const { triggerCoverLoad } = await import("../composables/useSearchTabs");
  const itemId = row.infoHash || row.hash || row.id;
  triggerCoverLoad(tabId, itemId, row.name, row.rawTitle);
}

// ── Download actions handled by DownloadButton ──────────────

// ── Init ────────────────────────────────────────────────────

onMounted(() => {
  loadProviders();

  // Close source filter on outside click
  document.addEventListener("click", () => {
    showSourceFilter.value = false;
  });

  const qParam = route.query.q;
  if (qParam && typeof qParam === "string" && qParam.trim()) {
    createUnifiedTab(qParam.trim());
  }
  if (
    unifiedTabs.value.length > 0 &&
    !unifiedTabs.value.some((t: any) => t.id === activeTabId.value)
  ) {
    switchTab(unifiedTabs.value[unifiedTabs.value.length - 1].id);
  }
});
</script>

<style scoped>
.unified-search-form {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
}
.unified-search-input {
  flex: 1;
  min-width: 0;
}
.unified-search-btn {
  flex-shrink: 0;
}
:deep(.s-table td:first-child) {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Empty state must remain a table cell — flex breaks colspan width */
:deep(.s-table td.s-table__empty) {
  display: table-cell;
  text-align: center;
}
/* Hide cover column on mobile */
@media (max-width: 768px) {
  :deep(.s-table th:first-child),
  :deep(.s-table td:first-child) {
    display: none;
  }
}

/* ── Tab custom slot ────────────────────────────────────── */
.tab-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.tab-status-icon {
  font-size: 0.7rem;
}
.tab-label-text {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 9px;
  background: var(--s-border);
  color: var(--s-text-secondary);
}
.tab-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 3px;
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

/* ── Search form ──────────────────────────────────────── */
.unified-search-form {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.unified-search-input {
  flex: 1;
  min-width: 0;
}
.unified-search-source {
  width: 200px;
  flex-shrink: 0;
}
.unified-search-btn {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .unified-search-form {
    gap: 1rem;
  }
  .unified-search-input {
    flex: 0 0 100%;
  }
  .unified-search-source {
    flex: 1;
    width: auto;
    min-width: 0;
  }
  .unified-search-btn {
    flex: 1;
  }
}

/* ── Source filter dropdown ──────────────────────────── */
.source-filter-trigger {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.source-filter-icon {
  font-size: 0.75rem;
  opacity: 0.6;
}
.source-filter-badge {
  font-size: 0.6rem;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--s-accent);
  color: #fff;
  line-height: 1.4;
}
.source-filter-dropdown {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  padding: 0.4rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
.source-filter-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  border-radius: 3px;
  font-size: 0.8rem;
  white-space: nowrap;
}
.source-filter-item:hover {
  background: var(--s-bg-hover);
}
.source-filter-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.source-filter-actions {
  display: flex;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem 0.1rem;
  border-top: 1px solid var(--s-border);
  margin-top: 0.3rem;
}

/* Remove ellipsis from source column — no truncation needed */
:deep(.s-table td:nth-child(6)) {
  overflow: visible;
  text-overflow: clip;
}

/* Force actions column width to match — prevents button overflow */
:deep(.s-table th:nth-child(7)),
:deep(.s-table td:nth-child(7)) {
  max-width: 78px;
  width: 78px;
}
</style>
