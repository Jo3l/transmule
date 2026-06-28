<template>
  <div class="search-results-table">
    <STable
      :data="data"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      @sort="onSort"
    >
      <!-- ── Header: Name filter ──────────────────────────── -->
      <template #header-name="{ column }">
        <SearchFilterHeader v-model="localNameFilter" :label="column.label" :placeholder="$t('search.filter')" />
      </template>

      <!-- ── Header: Source filter ────────────────────────── -->
      <template v-if="hasSourceFilter" #header-source="{ column }">
        <div class="source-header-wrap">
          <span class="source-header-label">{{ column.label }}</span>
          <SButton size="mini" @click.stop="showFilter = !showFilter">
            <span class="mdi mdi-filter-variant" />
          </SButton>
          <div v-if="showFilter" class="src-filter-dropdown" @click.stop>
            <label v-for="src in sortedSources" :key="src" class="src-filter-item" @click.stop>
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

      <!-- ── Cell: Cover ──────────────────────────────────── -->
      <template #cell-cover="{ row }">
        <slot name="cell-cover" :row="row">
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
        </slot>
      </template>

      <!-- ── Cell: Name ───────────────────────────────────── -->
      <template #cell-name="{ row }">
        <slot name="cell-name" :row="row">
          <SearchResultName :name="row.name" :tags="row.tags" />
        </slot>
      </template>

      <!-- ── Cell: Seeds / Sources ────────────────────────── -->
      <template #cell-seeds="{ row }">
        <slot name="cell-seeds" :row="row">
          <span
            v-if="row.slskdUsername"
            class="is-size-7"
          >{{ row.slskdUsername }}</span>
          <span
            v-else-if="seedersValue(row) != null"
            :class="seedersValue(row) > 0 ? 'has-text-success' : 'has-text-grey'"
          >{{ seedersValue(row) }}</span>
        </slot>
      </template>

      <!-- ── Cell: Leechers ───────────────────────────────── -->
      <template #cell-leechers="{ row }">
        <slot name="cell-leechers" :row="row">
          <span
            v-if="row.slskdUsername"
            class="has-text-grey"
          >&mdash;</span>
          <span
            v-else-if="leechersValue(row) != null"
            :class="leechersValue(row) > 0 ? 'has-text-danger' : 'has-text-grey'"
          >{{ leechersValue(row) }}</span>
        </slot>
      </template>

      <!-- ── Cell: seedsOrSources (STable uses prop for slot name) ── -->
      <template #cell-seedsOrSources="{ row }">
        <slot name="cell-seedsOrSources" :row="row">
          <span
            v-if="row.slskdUsername"
            class="is-size-7"
          >{{ row.slskdUsername }}</span>
          <span
            v-else-if="seedersValue(row) != null"
            :class="seedersValue(row) > 0 ? 'has-text-success' : 'has-text-grey'"
          >{{ seedersValue(row) }}</span>
        </slot>
      </template>

      <!-- ── Cell: Category ───────────────────────────────── -->
      <template #cell-category="{ row }">
        <slot name="cell-category" :row="row">
          {{ row.category }}
        </slot>
      </template>

      <!-- ── Cell: Source ─────────────────────────────────── -->
      <template #cell-source="{ row }">
        <slot name="cell-source" :row="row">
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
        </slot>
      </template>

      <!-- ── Cell: Actions ────────────────────────────────── -->
      <template #cell-actions="{ row }">
        <slot name="cell-actions" :row="row">
          <DownloadButton
            v-if="row.downloadUrl"
            service="pyload"
            :url="row.downloadUrl"
            :title="row.name"
            @download-end="$emit('downloadEnd', row)"
            @download-error="(err) => $emit('downloadError', err, row)"
          />
          <DownloadButton
            v-else-if="row.type === 'torrent' || row.magnet"
            service="transmission"
            :url="row.magnet"
            :hash="row.infoHash"
            :title="row.name"
            @download-end="$emit('downloadEnd', row)"
            @download-error="(err) => $emit('downloadError', err, row)"
          />
          <DownloadButton
            v-else
            service="amule"
            :hash="row.hash"
            :title="row.name"
            @download-end="$emit('downloadEnd', row)"
            @download-error="(err) => $emit('downloadError', err, row)"
          />
        </slot>
      </template>

      <!-- ── Cell: Free slot (slskd) ─────────────────────── -->
      <template #cell-free="{ row }">
        <slot name="cell-free" :row="row">
          {{ row.free ?? "" }}
        </slot>
      </template>

      <!-- ── Cell: Speed / k-s (slskd) ───────────────────── -->
      <template #cell-speed="{ row }">
        <slot name="cell-speed" :row="row">
          {{ row.speed ?? "" }}
        </slot>
      </template>

      <!-- ── Cell: Folder (slskd) ────────────────────────── -->
      <template #cell-folder="{ row }">
        <slot name="cell-folder" :row="row">
          {{ row.folder ?? "" }}
        </slot>
      </template>

      <!-- ── Generic cell fallback (for any column without template) ── -->
      <template v-for="col in extraSlotColumns" :key="col" #[`cell-${col}`]="{ row }">
        <slot :name="`cell-${col}`" :row="row" :value="row[col]">
          {{ row[col] }}
        </slot>
      </template>

      <!-- ── Empty state ──────────────────────────────── -->
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
import { computed, ref, onMounted, onUnmounted } from "vue";
import { isVideoExt, detectFileIcon } from "../composables/useSearchTabs";

const { t } = useI18n();

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
    showSourceFilter?: boolean;
    sortedSources?: string[];
    activeSourceFilters?: Set<string> | null;
    providerIconMap?: Record<string, string>;
    providerLabelMap?: Record<string, string>;
    sourceVariant?: (source: string) => string;
    /** Column keys for which the parent provides custom templates.
     *  Used when columns include keys not handled by the built-in templates. */
    extraSlots?: string[];
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
    extraSlots: () => [],
  },
);

const showFilter = ref(false);

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

function onDocumentClick(e: MouseEvent) {
  if (showFilter.value) {
    const el = (e.target as HTMLElement).closest(".src-filter-dropdown, .source-header-wrap");
    if (!el) showFilter.value = false;
  }
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onUnmounted(() => document.removeEventListener("click", onDocumentClick));

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

function seedersValue(row: any): number | null {
  if (row.seedsOrSources != null) return row.seedsOrSources;
  if (row.seeders != null) return row.seeders;
  return null;
}

function leechersValue(row: any): number | null {
  if (row.leechers != null) return row.leechers;
  return null;
}

/** Column keys that are NOT handled by built-in templates, so they need
 *  a dynamic fallback slot that can be overridden by the parent.
 *  Built-in templates: cover, name, seeds, leechers, category, source, actions, free, speed, folder */
const BUILT_IN = new Set(["cover", "name", "seeds", "leechers", "category", "source", "actions", "free", "speed", "folder"]);

const extraSlotColumns = computed(() => {
  const allKeys = props.columns.map((c: any) => c.key || c.prop).filter(Boolean);
  const userExtra = props.extraSlots ?? [];
  return [...new Set([...allKeys, ...userExtra])].filter((k) => !BUILT_IN.has(k));
});
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
:deep(.s-table th:nth-last-child(2)) {
  overflow: visible !important;
}
:deep(.s-table td:first-child) {
  display: flex;
  align-items: center;
  justify-content: center;
}
:deep(.s-table td.s-table__empty) {
  display: table-cell;
  text-align: center;
}
:deep(.s-table td:nth-last-child(2)) {
  overflow: visible;
  text-overflow: clip;
}
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
