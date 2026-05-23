<template>
  <div>
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-magnify mr-1" />
      {{ $t("torrentSearch.title") }}
    </h1>

    <!-- Search form -->
    <div class="box mb-4">
      <form @submit.prevent="onSearch">
        <div class="columns is-multiline">
          <div class="column is-6">
            <SFormItem :label="$t('torrentSearch.label')">
              <SInput v-model="query" :placeholder="$t('torrentSearch.placeholder')" autofocus>
                <template #prefix><span class="mdi mdi-magnify" /></template>
              </SInput>
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('torrentSearch.source')">
              <SSelect v-model="source" :options="sourceOptions" />
            </SFormItem>
          </div>
        </div>
        <SButton variant="primary" native-type="submit">
          <span class="mdi mdi-magnify mr-1" /> {{ $t("torrentSearch.button") }}
        </SButton>
        <SButton class="ml-3" @click.prevent="openTrackers">
          <span class="mdi mdi-antenna mr-1" /> {{ $t("torrentSearch.trackers") }}
        </SButton>
      </form>
    </div>

    <!-- ═══ Tabs ════════════════════════════════════════════════════════ -->
    <STabs v-if="torrentTabs.length > 0" v-model="currentTabName" variant="card" :panes="tabPanes">
      <template v-for="tab in torrentTabs" :key="tab.id" #[`tab-${tab.id}`]>
        <span class="tab-label-wrap">
          <!-- Status icon -->
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
          <!-- Query label -->
          <span class="tab-label-text">{{ tab.query }}</span>
          <!-- Result count badge -->
          <span class="tab-count-badge">{{ tab.results.length }}</span>
          <!-- Close button -->
          <button
            class="tab-close-btn"
            :title="$t('torrentSearch.closeTab')"
            @click.stop="closeTab(tab.id)"
          >
            <span class="mdi mdi-close" />
          </button>
        </span>
      </template>

      <!-- Tab content -->
      <STabPane
        v-for="tab in torrentTabs"
        :key="tab.id"
        :name="tab.id"
        :label="tab.query"
        :active="tab.id === (activeTabId ?? '')"
      >
        <!-- Loading per-source + stop button -->
        <div v-if="tab.status === 'searching'" class="mb-2">
          <span class="is-size-7 has-text-grey">
            <span class="mdi mdi-loading mdi-spin mr-1" />
            Searching {{ tab.sourcesCompleted.length }} / {{ totalPluginCount }} sources...
          </span>
          <SButton variant="warning" size="sm" @click="stopTorrentSearch(tab.id)">
            <span class="mdi mdi-stop mr-1" /> {{ $t("search.stop") }}
          </SButton>
        </div>

        <p v-if="tab.error" class="has-text-danger mt-3 mb-3">{{ tab.error }}</p>

        <STable :data="pagedResults" :columns="columns" row-key="infoHash">
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
              :seeders="row.seeders"
              :leechers="row.leechers"
              :category="row.category"
              :movie-details="row.movieDetails"
              @load-cover="loadCover(row)"
            />
            <span v-else class="result-cover-placeholder" :title="row.name">
              <span :class="['mdi result-cover-icon', detectFileIcon(row.name)]" />
            </span>
          </template>
          <!-- Name cell + tags -->
          <template #cell-name="{ row }">
            <SearchResultName :name="row.name" :tags="row.tags" />
          </template>

          <template #cell-source="{ row }">
            <STag :variant="sourceVariant(row.source)" size="sm">
              <span
                v-if="providerIconMap[row.source]"
                class="mdi"
                :class="[providerIconMap[row.source], 'mr-3px']"
              />{{ providerLabelMap[row.source] ?? row.source }}
            </STag>
          </template>

          <template #cell-seeders="{ row }">
            <span :class="row.seeders > 0 ? 'has-text-success' : 'has-text-grey'">
              {{ row.seeders }}
            </span>
          </template>

          <template #cell-leechers="{ row }">
            <span :class="row.leechers > 0 ? 'has-text-danger' : 'has-text-grey'">
              {{ row.leechers }}
            </span>
          </template>

          <template #cell-actions="{ row }">
            <DownloadButton
              service="transmission"
              :url="row.magnet"
              :hash="row.infoHash"
              :title="row.name"
              @download-end="addToast($t('torrentSearch.added', { name: row.name }), 'success')"
              @download-error="
                (err) => addToast(err?.message ?? $t('torrentSearch.addError'), 'error')
              "
            />
          </template>

          <template #empty>
            <div class="has-text-centered py-5 has-text-grey">
              <span class="mdi mdi-file-search-outline icon-lg" />
              <p>{{ $t("torrentSearch.enterSearch") }}</p>
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
      <p>{{ $t("torrentSearch.enterSearch") }}</p>
    </div>

    <!-- Trackers Dialog -->
    <SDialog v-model="trackersDialog" :title="$t('torrentSearch.trackersTitle')" width="520px">
      <p class="is-size-7 has-text-grey mb-1">{{ $t("torrentSearch.trackersDescription") }}</p>
      <p class="is-size-7 mb-3">
        {{ $t("torrentSearch.trackersGuide") }}
        <a href="https://dontorrent.blog/trackers-utorrent/" target="_blank" rel="noopener">
          dontorrent.blog/trackers-utorrent
        </a>
      </p>
      <textarea
        v-model="trackersText"
        class="trackers-textarea"
        :placeholder="$t('torrentSearch.trackersPlaceholder')"
      />
      <template #footer>
        <SButton variant="primary" :loading="savingTrackers" @click="saveAndClose">
          <span class="mdi mdi-content-save mr-1" /> {{ $t("settings.save") }}
        </SButton>
      </template>
    </SDialog>
  </div>
</template>

<script setup lang="ts">
import { isVideoExt, detectFileIcon } from "../../composables/useSearchTabs";
const { t } = useI18n();
const { addToast } = useToast();
const { loadDownloadHistory } = useDownloadHistory();
const { torrentSearchProviders, loadProviders } = useProviders();
const { tabs, activeTabId, createTorrentTab, closeTab, switchTab } = useSearchTabs();

// ── Filter tabs by service ──────────────────────────────────────────────────

const torrentTabs = computed(() => tabs.value.filter((t) => t.service === "transmission"));
const myActiveTab = computed(
  () => torrentTabs.value.find((t) => t.id === activeTabId.value) ?? null,
);

// ── Source options ─────────────────────────────────────────────────────────

const sourceOptions = computed(() => [
  { label: t("torrentSearch.sources.all"), value: "all" },
  ...torrentSearchProviders.value.map((p) => ({
    label: p.name,
    value: p.id,
  })),
]);

const totalPluginCount = computed(() => torrentSearchProviders.value.length);

// ── Tab panes for STabs ────────────────────────────────────────────────────

const currentTabName = computed({
  get: () => activeTabId.value ?? "",
  set: (val: string) => switchTab(val),
});

const tabPanes = computed(() => torrentTabs.value.map((t) => ({ name: t.id, label: t.query })));

// ── Columns ─────────────────────────────────────────────────────────────────

const columns = computed(() => [
  { key: "cover", label: "", width: 60, align: "center" as const },
  { prop: "name", label: t("torrentSearch.columns.name"), sortable: true },
  { prop: "category", label: t("torrentSearch.columns.category"), width: 120, sortable: true },
  {
    prop: "size_fmt",
    sortProp: "size",
    label: t("torrentSearch.columns.size"),
    width: 100,
    sortable: true,
  },
  {
    key: "seeders",
    prop: "seeders",
    label: t("torrentSearch.columns.seeders"),
    width: 70,
    sortable: true,
    align: "right" as const,
  },
  {
    key: "leechers",
    prop: "leechers",
    label: t("torrentSearch.columns.leechers"),
    width: 70,
    sortable: true,
    align: "right" as const,
  },
  { key: "source", label: t("torrentSearch.columns.source"), width: 75, align: "center" as const },
  { key: "actions", label: "", width: 78, align: "center" as const },
]);

// ── State ────────────────────────────────────────────────────────────────────

const query = ref("");
const source = ref("all");
const nameFilter = ref("");

// ── Client-side filter ──────────────────────────────────────────────────────

const filteredResults = computed(() => {
  if (!myActiveTab.value) return [];
  if (!nameFilter.value) return myActiveTab.value.results;
  const q = nameFilter.value.toLowerCase();
  return myActiveTab.value.results.filter((r) => r.name.toLowerCase().includes(q));
});

// ── Client-side pagination (50 per page) ────────────────────────────────────

const PAGE_SIZE = 50;
const currentPage = ref(1);

const pagedResults = computed(() => {
  const all = filteredResults.value;
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return all.slice(start, start + PAGE_SIZE);
});

watch(filteredResults, () => {
  currentPage.value = 1;
});

const VARIANT_PALETTE = ["primary", "success", "warning", "info", "accent"] as const;

const providerLabelMap = computed(() =>
  Object.fromEntries(torrentSearchProviders.value.map((p) => [p.id, p.name])),
);

const providerIconMap = computed(() =>
  Object.fromEntries(torrentSearchProviders.value.map((p) => [p.id, p.icon])),
);

const providerVariantMap = computed(() =>
  Object.fromEntries(
    torrentSearchProviders.value.map((p, i) => [p.id, VARIANT_PALETTE[i % VARIANT_PALETTE.length]]),
  ),
);

function sourceVariant(src: string) {
  return providerVariantMap.value[src] ?? "default";
}

// ── Search ───────────────────────────────────────────────────────────────────

function onSearch() {
  if (!query.value.trim()) return;
  createTorrentTab(query.value.trim(), source.value);
}

// ── Cover on hover ───────────────────────────────────────────────────────────

async function loadCover(row: any) {
  if (row.cover && row.movieDetails) return;
  const { triggerCoverLoad } = await import("../../composables/useSearchTabs");
  triggerCoverLoad(
    myActiveTab.value?.id ?? "",
    row.infoHash || row.hash || "",
    row.name,
    row.rawTitle,
  );
}

// ── Stop ────────────────────────────────────────────────────────────────────

function stopTorrentSearch(tabId: string) {
  // Just stop the stream — keep the tab with current results
  closeTab(tabId);
}

// ── Trackers ────────────────────────────────────────────

const trackersDialog = ref(false);
const { trackersText, savingTrackers, loadTrackers, saveTrackers } = useTrackers();

async function openTrackers() {
  await loadTrackers();
  trackersDialog.value = true;
}

async function saveAndClose() {
  await saveTrackers();
  trackersDialog.value = false;
}

// ── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await loadDownloadHistory();
  await loadProviders();
  // If activeTabId doesn't belong to a torrent tab, switch to the latest one
  if (torrentTabs.value.length > 0 && !torrentTabs.value.some((t) => t.id === activeTabId.value)) {
    switchTab(torrentTabs.value[torrentTabs.value.length - 1].id);
  }
});
</script>

<style scoped>
.trackers-textarea {
  width: 100%;
  min-height: 180px;
  font-family: monospace;
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
  resize: vertical;
  border: 1px solid var(--s-border);
  background: var(--s-input-bg, var(--s-bg));
  color: var(--s-text);
  border-radius: 4px;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.trackers-textarea:focus {
  border-color: var(--s-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--s-accent) 20%, transparent);
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

/* Remove ellipsis from source column */
:deep(.s-table td:nth-child(7)) {
  overflow: visible;
  text-overflow: clip;
}

/* Force actions column width */
:deep(.s-table th:nth-child(8)),
:deep(.s-table td:nth-child(8)) {
  max-width: 78px;
  width: 78px;
}
</style>
