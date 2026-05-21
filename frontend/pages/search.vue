<template>
  <div id="page-unified-search">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-magnify mr-1" />
      Búsqueda global
    </h1>

    <!-- Search form: input + button inline -->
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
        <div v-if="tab.status === 'searching'" class="flex-row gap-md mb-2">
          <span class="is-size-7 has-text-grey">
            <span class="mdi mdi-loading mdi-spin mr-1" />
            Buscando{{ tab.results.length ? ` (${tab.results.length} resultados)` : "…" }}
          </span>
        </div>
        <div
          v-else-if="tab.status === 'complete' && tab.results.length > 0"
          class="mb-2 is-size-7 has-text-grey"
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
          <template #cell-source="{ row }">
            <STag :variant="row.type === 'amule' ? 'accent' : 'info'" size="sm">
              <span v-if="row.type === 'amule'" class="mdi mdi-server-network mr-1" />
              <span v-else class="mdi mdi-magnet mr-1" />
              {{ row.source }}
            </STag>
          </template>

          <!-- Actions -->
          <template #cell-actions="{ row }">
            <SButton
              v-if="row.type === 'torrent'"
              size="sm"
              variant="success"
              :loading="addingHash === row.id"
              :disabled="addedTorrents.has(row.id) || !!addingHash"
              :title="addedTorrents.has(row.id) ? 'Ya añadido' : 'Añadir a Transmission'"
              @click="addTorrent(row)"
            >
              <span v-if="addedTorrents.has(row.id)" class="mdi mdi-check" />
              <span v-else class="mdi mdi-download" />
            </SButton>
            <SButton
              v-else
              size="sm"
              variant="success"
              :loading="downloadingAmule === row.id"
              :disabled="downloadedAmule.has(row.id) || !!downloadingAmule"
              :title="downloadedAmule.has(row.id) ? 'Descargando' : 'Descargar en aMule'"
              @click="downloadAmule(row)"
            >
              <span v-if="downloadedAmule.has(row.id)" class="mdi mdi-check" />
              <span v-else class="mdi mdi-download" />
            </SButton>
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

const { apiFetch } = useApi();
const route = useRoute();

const { tabs, activeTabId, createUnifiedTab, closeTab, switchTab, downloadAmuleHash } =
  useSearchTabs();

// ── Filter tabs by service ──────────────────────────────────

const unifiedTabs = computed(() => tabs.value.filter((t: any) => t.service === "unified"));

// ── Form state ──────────────────────────────────────────────

const query = ref("");

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

  return results;
});

// ── Columns ─────────────────────────────────────────────────

const PAGE_SIZE = 50;

const sortField = ref("");
const sortDir = ref<"asc" | "desc">("asc");

const columns = [
  { key: "cover", label: "", align: "center" as const },
  { prop: "name", label: "Nombre", sortable: true },
  { prop: "size_fmt", sortProp: "size", label: "Tamaño", width: 110, sortable: true },
  {
    key: "seeds",
    prop: "seedsOrSources",
    label: "SE",
    width: 70,
    sortable: true,
    align: "right" as const,
  },
  {
    key: "leechers",
    prop: "leechers",
    label: "LE",
    width: 70,
    sortable: true,
    align: "right" as const,
  },
  { key: "source", label: "Fuente", width: 130, sortable: true, align: "center" as const },
  { key: "actions", label: "", width: 55, align: "center" as const },
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
  createUnifiedTab(query.value.trim());
  query.value = "";
}

// ── Cover loading ───────────────────────────────────────────

async function loadCover(tabId: string, row: any) {
  if (row.cover && row.movieDetails) return;
  const { triggerCoverLoad } = await import("../composables/useSearchTabs");
  const itemId = row.infoHash || row.hash || row.id;
  triggerCoverLoad(tabId, itemId, row.name, row.rawTitle);
}

// ── Download actions ────────────────────────────────────────

const addingHash = ref("");
const addedTorrents = ref(new Set<string>());

async function addTorrent(row: any) {
  if (!row.magnet) return;
  addingHash.value = row.id;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: row.magnet },
    });
    addedTorrents.value.add(row.id);
  } catch {
    /* silent */
  }
  addingHash.value = "";
}

const downloadingAmule = ref("");
const downloadedAmule = ref(new Set<string>());

async function downloadAmule(row: any) {
  if (!row.hash) return;
  downloadingAmule.value = row.id;
  try {
    await downloadAmuleHash(row.hash);
    downloadedAmule.value.add(row.id);
  } catch {
    /* silent */
  }
  downloadingAmule.value = "";
}

// ── Init ────────────────────────────────────────────────────

onMounted(() => {
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
</style>
