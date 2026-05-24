<template>
  <div class="search-results-table">
    <STable
      :data="data"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      @sort="onSort"
    >
      <!-- Name header with filter -->
      <template #header-name="{ column }">
        <SearchFilterHeader v-model="localNameFilter" :label="column.label" :placeholder="$t('search.filter')" />
      </template>

      <!-- Source header filter (only for mixed/global search) -->
      <template v-if="hasSourceFilter" #header-source="{ column }">
        <div class="source-header-wrap">
          <span class="source-header-label">{{ column.label }}</span>
          <SButton
            size="mini"
            @click.stop="showFilter = !showFilter"
          >
            <span class="mdi mdi-filter-variant" />
          </SButton>
          <div v-if="showFilter" class="src-filter-dropdown" @click.stop>
            <label v-for="src in sortedSources" :key="src" class="src-filter-item" @click="$emit('toggleSource', src)">
              <SCheckbox
                :model-value="activeSourceFilters === null || !!(activeSourceFilters?.has(src))"
                @update:model-value="$emit('toggleSource', src)"
              />
              <span class="src-filter-label">{{ providerLabelMap?.[src] ?? src }}</span>
            </label>
            <div class="src-filter-actions">
              <SButton size="sm" @click="$emit('selectAllSources')">{{ $t("search.selectAll") }}</SButton>
              <SButton size="sm" @click="$emit('clearAllSources')">{{ $t("search.selectNone") }}</SButton>
            </div>
          </div>
        </div>
      </template>

      <!-- Cover -->
      <template #cell-cover="{ row }">
        <ResultCover
          v-if="isVideoExt(row.name)"
          :cover="row.cover"
          :name="row.name"
          :size="row.size_fmt"
          :seeders="seedersValue(row) ?? undefined"
          :leechers="leechersValue(row) ?? undefined"
          :category="row.category"
          :movie-details="row.movieDetails"
          @load-cover="$emit('loadCover', row)"
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
          v-if="seedersValue(row) != null"
          :class="seedersValue(row) > 0 ? 'has-text-success' : 'has-text-grey'"
        >{{ seedersValue(row) }}</span>
      </template>

      <!-- Leechers (torrent leechers / amule sources) -->
      <template #cell-leechers="{ row }">
        <span
          v-if="leechersValue(row) != null"
          :class="leechersValue(row) > 0 ? 'has-text-danger' : 'has-text-grey'"
        >{{ leechersValue(row) }}</span>
      </template>

      <!-- Category (torrent-specific) -->
      <template #cell-category="{ row }">
        {{ row.category }}
      </template>

      <!-- Source -->
      <template #cell-source="{ row }">
        <template v-if="providerIconMap && providerLabelMap">
          <STag :variant="sourceVariant?.(row.source)" size="sm">
            <span
              v-if="providerIconMap[row.source]"
              class="mdi"
              :class="[providerIconMap[row.source], 'mr-3px']"
            />{{ providerLabelMap[row.source] ?? row.source }}
          </STag>
        </template>
        <template v-else>
          <STag :variant="row.type === 'amule' ? 'accent' : 'info'" size="sm">
            <span v-if="row.type === 'amule'" class="mdi mdi-server-network mr-1" />
            <span v-else class="mdi mdi-magnet mr-1" />
            {{ row.source }}
          </STag>
        </template>
      </template>

      <!-- Actions -->
      <template #cell-actions="{ row }">
        <DownloadButton
          v-if="row.downloadUrl"
          service="pyload"
          :url="row.downloadUrl"
          :title="row.name"
          @download-end="$emit('downloadEnd', row)"
          @download-error="(err: any) => $emit('downloadError', err, row)"
        />
        <DownloadButton
          v-else-if="row.type === 'torrent' || row.magnet"
          service="transmission"
          :url="row.magnet"
          :hash="row.infoHash"
          :title="row.name"
          @download-end="$emit('downloadEnd', row)"
          @download-error="(err: any) => $emit('downloadError', err, row)"
        />
        <DownloadButton
          v-else
          service="amule"
          :hash="row.hash"
          :title="row.name"
          @download-end="$emit('downloadEnd', row)"
          @download-error="(err: any) => $emit('downloadError', err, row)"
        />
      </template>

      <!-- Empty state -->
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          <span class="mdi mdi-file-search-outline icon-lg" />
          <p>{{ emptyText }}</p>
        </div>
      </template>
    </STable>

    <SPagination
      v-if="total > pageSize"
      v-model="currentPageModel"
      :total="total"
      :page-size="pageSize"
      class="mt-2"
    />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();

import { isVideoExt, detectFileIcon } from "../composables/useSearchTabs";

const props = withDefaults(
  defineProps<{
    data: any[];
    columns: any[];
    loading?: boolean;
    total?: number;
    page?: number;
    pageSize?: number;
    rowKey?: string;
    nameFilter?: string;
    emptyText?: string;
    hasSourceFilter?: boolean;
    /** Show source filter dropdown */
    showSourceFilter?: boolean;
    sortedSources?: string[];
    /** Currently active source filters (set of source IDs) */
    activeSourceFilters?: Set<string> | null;
    /** Maps source names to provider icons (transmission search) */
    providerIconMap?: Record<string, string>;
    /** Maps source names to provider labels (transmission search) */
    providerLabelMap?: Record<string, string>;
    /** Source variant function (transmission search) */
    sourceVariant?: (source: string) => string;
  }>(),
  {
    loading: false,
    total: 0,
    page: 1,
    pageSize: 50,
    rowKey: "id",
    nameFilter: "",
    emptyText: "",
    hasSourceFilter: false,
    showSourceFilter: false,
    activeSourceFilters: null,
    providerIconMap: undefined,
    providerLabelMap: undefined,
    sourceVariant: undefined,
  },
);

const showFilter = ref(false);

function onDocumentClick(e: MouseEvent) {
  if (showFilter.value) {
    const el = (e.target as HTMLElement).closest(".src-filter-dropdown, .source-header-wrap");
    if (!el) showFilter.value = false;
  }
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onUnmounted(() => document.removeEventListener("click", onDocumentClick));

const emit = defineEmits<{
  "update:page": [value: number];
  "update:nameFilter": [value: string];
  sort: [field: string, dir: "asc" | "desc"];
  loadCover: [row: any];
  downloadEnd: [row: any];
  downloadError: [error: any, row: any];
  toggleSource: [source: string];
  selectAllSources: [];
  clearAllSources: [];
}>();

const currentPageModel = computed({
  get: () => props.page ?? 1,
  set: (val: number) => emit("update:page", val),
});

const localNameFilter = computed({
  get: () => props.nameFilter ?? "",
  set: (val: string) => emit("update:nameFilter", val),
});

function onSort(field: string, dir: "asc" | "desc") {
  emit("sort", field, dir);
}

/** Extract the seeders/sources number regardless of field name. */
function seedersValue(row: any): number | null {
  if (row.seedsOrSources != null) return row.seedsOrSources;
  if (row.seeders != null) return row.seeders;
  return null;
}

/** Extract the leechers number. */
function leechersValue(row: any): number | null {
  if (row.leechers != null) return row.leechers;
  return null;
}
</script>

<style scoped>
.source-header-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  position: relative;
}
.source-header-label {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
/* Allow dropdown to overflow the header cell (source = 2nd from last) */
:deep(.s-table th:nth-last-child(2)) {
  overflow: visible !important;
}
/* Cover cell: center the cover/icon */
:deep(.s-table td:first-child) {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Empty state must remain table-cell — flex breaks colspan width */
:deep(.s-table td.s-table__empty) {
  display: table-cell;
  text-align: center;
}
/* Source cell: prevent ellipsis truncation */
:deep(.s-table td:nth-last-child(2)) {
  overflow: visible;
  text-overflow: clip;
}
/* Actions column: fixed width for the button */
:deep(.s-table th:last-child),
:deep(.s-table td:last-child) {
  max-width: 78px;
  width: 78px;
}
.src-filter-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 999;
  min-width: 200px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  padding: 0.4rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
.src-filter-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  border-radius: 3px;
  font-size: 0.8rem;
  white-space: nowrap;
}
.src-filter-item:hover {
  background: var(--s-bg-hover);
}
.src-filter-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.src-filter-actions {
  display: flex;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem 0.1rem;
  border-top: 1px solid var(--s-border);
  margin-top: 0.3rem;
}

/* ── Mobile: hide cover, fixed name width ─────────────── */
@media (max-width: 768px) {
  :deep(.s-table th:first-child),
  :deep(.s-table td:first-child) {
    display: none;
  }
  :deep(.s-table th:nth-child(2)),
  :deep(.s-table td:nth-child(2)) {
    width: 37.5rem !important;
    min-width: 37.5rem !important;
  }
}
</style>
