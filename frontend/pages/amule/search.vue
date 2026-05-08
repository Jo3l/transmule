<template>
  <div id="page-amule-search">
    <h1 class="title is-4 mb-4">{{ $t("search.title") }}</h1>

    <!-- Search form -->
    <div class="box mb-4">
      <form @submit.prevent="onSearch">
        <div class="search-form">
          <div class="search-form__row search-form__row--main">
            <SFormItem :label="$t('search.label')" class="search-form__query">
              <SInput v-model="query" :placeholder="$t('search.placeholder')">
                <template #prefix><span class="mdi mdi-magnify" /></template>
              </SInput>
            </SFormItem>
            <SFormItem :label="$t('search.type')" class="search-form__type">
              <SSelect
                v-model="searchType"
                :options="[
                  { label: $t('search.global'), value: 'Global' },
                  { label: $t('search.local'), value: 'Local' },
                  { label: $t('search.kad'), value: 'KAD' },
                ]"
              />
            </SFormItem>
            <SFormItem :label="$t('search.minSources')" class="search-form__sources">
              <SInput v-model="avail" type="number" placeholder="0" />
            </SFormItem>
          </div>
          <div class="search-form__row search-form__row--size">
            <SFormItem :label="$t('search.minSize')" class="search-form__size">
              <div class="flex-row gap-sm">
                <SInput v-model="minSize" type="number" placeholder="0" />
                <SSelect v-model="minSizeUnit" :options="sizeUnits" />
              </div>
            </SFormItem>
            <SFormItem :label="$t('search.maxSize')" class="search-form__size">
              <div class="flex-row gap-sm">
                <SInput v-model="maxSize" type="number" placeholder="0" />
                <SSelect v-model="maxSizeUnit" :options="sizeUnits" />
              </div>
            </SFormItem>
          </div>
        </div>
        <SButton variant="primary" native-type="submit">
          <span class="mdi mdi-magnify mr-1" /> {{ $t("search.button") }}
        </SButton>
      </form>
    </div>

    <!-- ═══ Tabs ════════════════════════════════════════════════════════ -->
    <STabs v-if="amuleTabs.length > 0" v-model="currentTabName" variant="card" :panes="tabPanes">
      <template v-for="tab in amuleTabs" :key="tab.id" #[`tab-${tab.id}`]>
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
          <button
            class="tab-close-btn"
            :title="$t('search.closeTab')"
            @click.stop="closeTab(tab.id)"
          >
            <span class="mdi mdi-close" />
          </button>
        </span>
      </template>

      <!-- Tab content -->
      <STabPane
        v-for="tab in amuleTabs"
        :key="tab.id"
        :name="tab.id"
        :label="tab.query"
        :active="tab.id === (activeTabId ?? '')"
      >
        <!-- Progress bar + stop for active search -->
        <div v-if="tab.status === 'searching'" class="flex-row gap-md mb-2">
          <SButton variant="warning" size="sm" @click="stopSearch(tab.id)">
            <span class="mdi mdi-stop mr-1" /> {{ $t("search.stop") }}
          </SButton>
          <span class="has-text-grey is-size-7">
            {{ $t("search.searching") }} {{ Math.round(tab.progress * 100) }}%
          </span>
        </div>

        <p v-if="tab.error" class="has-text-danger mt-3 mb-3">{{ tab.error }}</p>

        <STable :data="pagedResults" :columns="columns" row-key="hash">
          <!-- Name header with filter -->
          <template #header-name="{ column }">
            <SearchFilterHeader
              v-model="nameFilter"
              :label="column.label"
              placeholder="filtrar por nombre"
            />
          </template>
          <!-- Cover thumbnail -->
          <template #cell-cover="{ row }">
            <ResultCover
              v-if="isVideoExt(row.name)"
              :cover="row.cover"
              :name="row.name"
              :size="row.size_fmt"
              :movie-details="row.movieDetails"
              @load-cover="loadCover(row)"
            />
            <span v-else class="result-cover-placeholder" :title="row.name">
              <span :class="['result-cover-icon', detectFileIcon(row.name)]" />
            </span>
          </template>
          <!-- Name cell + tags -->
          <template #cell-name="{ row }">
            <SearchResultName
              :name="row.name"
              :tags="row.tags"
              :name-class="downloadedHashes.has(row.hash) ? 'has-text-danger' : ''"
            />
          </template>
          <template #cell-sizeFull="{ row }">{{ row.size_fmt }}</template>
          <template #cell-sources="{ row }">{{ row.sources }}</template>
          <template #cell-actions="{ row }">
            <SButton
              v-if="!downloadedHashes.has(row.hash)"
              variant="success"
              size="sm"
              :loading="downloadingHash === row.hash"
              :title="$t('search.download')"
              @click="downloadOne(row)"
            >
              <span class="mdi mdi-download" />
            </SButton>
            <span
              v-else
              class="mdi mdi-check has-text-success"
              :title="$t('search.alreadyDownloading')"
            />
          </template>
          <template #empty>
            <div class="has-text-centered py-5 has-text-grey">
              <span class="mdi mdi-file-search-outline icon-lg" />
              <p>
                {{ $t("search.enterSearch") }}
              </p>
            </div>
          </template>
        </STable>
        <SPagination
          v-if="filteredResults.length > PAGE_SIZE"
          v-model="currentPage"
          :total="filteredResults.length"
          :page-size="PAGE_SIZE"
        />
      </STabPane>
    </STabs>

    <!-- No tabs yet -->
    <div v-else class="has-text-centered py-5 has-text-grey">
      <span class="mdi mdi-file-search-outline icon-lg" />
      <p>{{ $t("search.enterSearch") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isVideoExt, detectFileIcon } from "../../composables/useSearchTabs";
const { apiFetch } = useApi();
const { amuleRunning } = useServiceGuard();
const { t } = useI18n();

const {
  tabs,
  activeTabId,
  activeTab,
  tabCount,
  createAmuleTab,
  closeTab,
  switchTab,
  downloadAmuleHash,
} = useSearchTabs();

// ── Filter tabs by service ──────────────────────────────────────────────────

const amuleTabs = computed(() => tabs.value.filter((t) => t.service === "amule"));
const myActiveTab = computed(() => amuleTabs.value.find((t) => t.id === activeTabId.value) ?? null);

// ── Form state ──────────────────────────────────────────────────────────────

const sizeUnits = computed(() => [
  { label: t("search.sizeUnits.bytes"), value: "1" },
  { label: t("search.sizeUnits.kb"), value: "1024" },
  { label: t("search.sizeUnits.mb"), value: "1048576" },
  { label: t("search.sizeUnits.gb"), value: "1073741824" },
]);

const columns = computed(() => [
  { key: "cover", label: "", align: "center" as const },
  { prop: "name", label: t("search.columns.name"), sortable: true },
  { prop: "sizeFull", label: t("search.columns.size"), width: 120, sortable: true },
  {
    prop: "sources",
    label: t("search.columns.sources"),
    width: 90,
    sortable: true,
    align: "right" as const,
  },
  { key: "actions", label: "", width: 50 },
]);

const query = ref("");
const searchType = ref("Global");
const avail = ref("");
const minSize = ref("");
const minSizeUnit = ref("1048576");
const maxSize = ref("");
const maxSizeUnit = ref("1048576");
const downloadingHash = ref("");
const downloadedHashes = ref(new Set<string>());
const nameFilter = ref("");

// ── Client-side filter ──────────────────────────────────────────────────────

const filteredResults = computed(() => {
  if (!myActiveTab.value) return [];
  if (!nameFilter.value) return myActiveTab.value.results;
  const q = nameFilter.value.toLowerCase();
  return myActiveTab.value.results.filter((r: any) => (r.name ?? "").toLowerCase().includes(q));
});

// ── Client-side pagination (50 per page) ────────────────────────────────────

const PAGE_SIZE = 50;
const currentPage = ref(1);

const pagedResults = computed(() => {
  const all = filteredResults.value;
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return all.slice(start, start + PAGE_SIZE);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredResults.value.length / PAGE_SIZE)));

watch(filteredResults, () => {
  currentPage.value = 1;
});

const currentTabName = computed({
  get: () => activeTabId.value ?? "",
  set: (val: string) => switchTab(val),
});

const tabPanes = computed(() => amuleTabs.value.map((t) => ({ name: t.id, label: t.query })));

// ── Search ─────────────────────────────────────────────────────────────────

function onSearch() {
  if (!query.value.trim()) return;
  fetchDownloadHashes();
  createAmuleTab({
    query: query.value.trim(),
    searchType: searchType.value,
    avail: avail.value,
    minSize: minSize.value,
    minSizeUnit: minSizeUnit.value,
    maxSize: maxSize.value,
    maxSizeUnit: maxSizeUnit.value,
  });
}

// ── Cover on hover ───────────────────────────────────────────────────────────

async function loadCover(row: any) {
  if (row.cover && row.movieDetails) return;
  const { triggerCoverLoad } = await import("../../composables/useSearchTabs");
  triggerCoverLoad(
    myActiveTab.value?.id ?? "",
    row.hash || row.infoHash || "",
    row.name,
    row.rawTitle,
  );
}

// ── Stop ────────────────────────────────────────────────────────────────────

function stopSearch(tabId: string) {
  // Stop the backend search but keep the tab with current results
  apiFetch("/api/amule/search", {
    method: "POST",
    body: { action: "stop" },
  }).catch(() => {});
  // Stop polling and mark tab complete
  import("../../composables/useSearchTabs").then((m) => m.stopAmuleSearch(tabId));
}

// ── Download ────────────────────────────────────────────────────────────────

async function downloadOne(row: any) {
  downloadingHash.value = row.hash;
  try {
    await downloadAmuleHash(row.hash);
    downloadedHashes.value.add(row.hash);
    await fetchDownloadHashes();
  } finally {
    downloadingHash.value = "";
  }
}

async function fetchDownloadHashes() {
  try {
    const res = await apiFetch<any>("/api/amule/downloads");
    const files = res?.downloads?.files || [];
    downloadedHashes.value = new Set(files.map((f: any) => f.hash));
  } catch {
    /* silent */
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

onMounted(() => {
  fetchDownloadHashes();
  // If activeTabId doesn't belong to an amule tab, switch to the latest one
  if (amuleTabs.value.length > 0 && !amuleTabs.value.some((t) => t.id === activeTabId.value)) {
    switchTab(amuleTabs.value[amuleTabs.value.length - 1].id);
  }
});
</script>

<style scoped>
.search-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.search-form__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}
.search-form__query {
  flex: 2 1 200px;
  min-width: 0;
}
.search-form__type {
  flex: 1 1 120px;
  min-width: 100px;
}
.search-form__sources {
  flex: 1 1 100px;
  min-width: 80px;
}
.search-form__size {
  flex: 1 1 180px;
  min-width: 150px;
}

@media (max-width: 480px) {
  .search-form__query,
  .search-form__type,
  .search-form__sources,
  .search-form__size {
    flex: 1 1 100%;
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
