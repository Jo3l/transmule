<template>
  <div id="page-unified-search">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-magnify mr-1" />
      {{ $t("search.globalSearch") }}
    </h1>

    <!-- Search form: input + source select + button -->
    <div class="box mb-4">
      <form @submit.prevent="onSearch" class="unified-search-form">
        <SInput
          v-model="query"
          :placeholder="$t('search.placeholderGlobal')"
          class="unified-search-input"
          autofocus
        >
          <template #prefix><span class="mdi mdi-magnify" /></template>
        </SInput>
        <SSelect v-model="searchSource" :options="sourceOptions" class="unified-search-source" />
        <SButton variant="primary" native-type="submit" class="unified-search-btn">
          <span class="mdi mdi-magnify mr-1" /> {{ $t("search.button") }}
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
          <button class="tab-close-btn" :title="$t('search.closeTab')" @click.stop="closeTab(tab.id)">
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
            {{ tab.results.length ? $t("search.resultsCount", { count: tab.results.length }) : $t("search.searching") }}
          </span>
        </div>
        <div
          v-else-if="tab.status === 'complete' && tab.results.length > 0"
          class="mb-2 is-size-7 has-text-grey has-text-centered"
        >
          {{ $t("search.resultsCount", { count: tab.results.length }) }}
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

        <SearchResultsTable
          :data="pagedResults"
          :columns="columns"
          :total="totalFiltered"
          :page="currentPage"
          :page-size="PAGE_SIZE"
          :name-filter="nameFilter"
          :empty-text="tab.status === 'searching' ? $t('search.searchingResults') : $t('search.noResultsFor', { query: tab.query })"
          :has-source-filter="true"
          :show-source-filter="showSourceFilter"
          :sorted-sources="sortedSources"
          :active-source-filters="activeSourceFilters"
          :provider-icon-map="providerIconMap"
          :provider-label-map="providerLabelMap"
          :source-variant="sourceVariant"
          row-key="id"
          @sort="onSort"
          @update:page="currentPage = $event"
          @update:name-filter="nameFilter = $event"
          @load-cover="loadCover(tab.id, $event)"
          @toggle-source="toggleSource"
          @select-all-sources="selectAllSources"
          @clear-all-sources="clearAllSources"
        />
      </STabPane>
    </STabs>

    <!-- No tabs yet -->
    <div v-else class="has-text-centered py-5 has-text-grey">
      <span class="mdi mdi-file-search-outline icon-lg" />
      <p>{{ $t("search.enterTermBoth") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const { torrentSearchProviders, mediaProviders, loadProviders } = useProviders();

const providerLabelMap = computed(() => {
  const map: Record<string, string> = { amule: "aMule" };
  for (const p of torrentSearchProviders.value) {
    map[p.id] = p.name;
  }
  return map;
});
const providerIconMap = computed(() => {
  const map: Record<string, string> = { amule: "mdi-server-network" };
  for (const p of torrentSearchProviders.value) {
    map[p.id] = p.icon;
  }
  return map;
});
const VARIANT_PALETTE = ["primary", "success", "warning", "info", "accent"] as const;
const providerVariantMap = computed(() => {
  const map: Record<string, string> = { amule: "accent" };
  torrentSearchProviders.value.forEach((p, i) => {
    map[p.id] = VARIANT_PALETTE[i % VARIANT_PALETTE.length];
  });
  return map;
});
function sourceVariant(src: string) {
  return providerVariantMap.value[src] ?? "default";
}

const { tabs, activeTabId, createUnifiedTab, closeTab, switchTab } = useSearchTabs();

// ── Filter tabs by service ──────────────────────────────────

const unifiedTabs = computed(() => tabs.value.filter((t: any) => t.service === "unified"));

// ── Form state ──────────────────────────────────────────────

const query = ref("");
const searchSource = ref("all");

const sourceOptions = computed(() => {
  const opts: { label: string; value: string }[] = [
    { label: t("search.allPlugins"), value: "all" },
    { label: t("downloads.sources.amule"), value: "amule" },
  ];
  for (const p of torrentSearchProviders.value) {
    opts.push({ label: p.name, value: p.id });
  }
  // Add media providers that can appear in global search
  for (const p of mediaProviders.value) {
    if (p.id === "archive-org") {
      opts.push({ label: p.name, value: p.id });
    }
  }
  return opts;
});

// ── Source filter (per-search, column filter) ──────────────
const showSourceFilter = ref(false);
const activeSourceFilters = ref<Set<string> | null>(null);

const allSources = computed(() => {
  const s = new Set<string>();
  const tab = activeUnifiedTab.value;
  if (tab?.results) {
    for (const r of tab.results) s.add(r.source);
  }
  return s;
});

const sortedSources = computed(() => [...allSources.value].sort());

function toggleSource(src: string) {
  if (activeSourceFilters.value === null) {
    // Initialize with all sources selected when first toggling
    activeSourceFilters.value = new Set(allSources.value);
  }
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
  { prop: "name", label: t("search.columns.name"), sortable: true },
  { prop: "size_fmt", sortProp: "size", label: t("search.columns.size"), width: 85, sortable: true },
  {
    key: "seeds",
    prop: "seedsOrSources",
    label: t("search.columns.se"),
    width: 50,
    sortable: true,
    align: "right" as const,
  },
  {
    key: "leechers",
    prop: "leechers",
    label: t("search.columns.le"),
    width: 50,
    sortable: true,
    align: "right" as const,
  },
  { key: "source", label: t("search.columns.source"), width: 110, sortable: true, align: "center" as const },
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

</style>
