<template>
  <div class="s-loading-wrap">
    <div
      class="s-table-wrap"
      :style="
        maxHeight ? { maxHeight: `${maxHeight}px`, overflow: 'auto' } : {}
      "
    >
      <table :class="tableClasses">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="colKey(col)"
              :style="colStyle(col)"
              :class="{ sortable: col.sortable }"
              @click="col.sortable && onSort(col)"
            >
              <template v-if="col.type === 'selection'">
                <SCheckbox
                  :model-value="allSelected"
                  @update:model-value="toggleAll"
                />
              </template>
              <template v-else-if="col.type === 'expand'" />
              <template v-else>
                {{ col.label }}
                <span
                  v-if="col.sortable && sortProp === (col.prop || col.key)"
                  class="sort-icon"
                >
                  {{ sortDir === "asc" ? "▲" : "▼" }}
                </span>
              </template>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="!sortedData.length">
            <tr>
              <td :colspan="columns.length" class="s-table__empty">
                <slot name="empty">No data</slot>
              </td>
            </tr>
          </template>
          <template v-for="(row, idx) in sortedData" :key="rowKeyFn(row, idx)">
            <tr
              :class="{
                'is-selected': isSelected(row),
                'is-current': highlightCurrent && currentRow === row,
              }"
              @click="onRowClick(row, idx)"
            >
              <td
                v-for="col in columns"
                :key="colKey(col)"
                :style="colStyle(col)"
              >
                <template v-if="col.type === 'selection'">
                  <SCheckbox
                    :model-value="isSelected(row)"
                    @update:model-value="toggleRow(row)"
                  />
                </template>
                <template v-else-if="col.type === 'expand'">
                  <button
                    class="s-btn s-btn--text s-btn--sm"
                    style="padding: 0.15rem 0.3rem"
                    @click.stop="toggleExpand(rowKeyFn(row, idx))"
                  >
                    <span
                      class="mdi"
                      :class="
                        isExpanded(rowKeyFn(row, idx))
                          ? 'mdi-chevron-down'
                          : 'mdi-chevron-right'
                      "
                    />
                  </button>
                </template>
                <template v-else-if="$slots[`cell-${col.prop || col.key}`]">
                  <slot
                    :name="`cell-${col.prop || col.key}`"
                    :row="row"
                    :index="idx"
                  />
                </template>
                <template v-else>
                  {{ col.prop ? row[col.prop] : "" }}
                </template>
              </td>
            </tr>
            <!-- Expand row -->
            <tr
              v-if="hasExpandColumn && isExpanded(rowKeyFn(row, idx))"
              class="s-table__expand-row"
            >
              <td :colspan="columns.length">
                <div class="s-table__expand-content">
                  <slot name="expand" :row="row" :index="idx" />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <!-- Loading overlay -->
    <div v-if="loading" class="s-loading-overlay">
      <div class="s-loading-spinner" />
    </div>
  </div>
</template>

<script setup lang="ts">
export interface STableColumn {
  key?: string;
  prop?: string;
  label?: string;
  width?: number | string;
  minWidth?: number | string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  type?: "selection" | "expand";
}

const props = withDefaults(
  defineProps<{
    data?: any[];
    columns?: STableColumn[];
    loading?: boolean;
    stripe?: boolean;
    selectable?: boolean;
    rowKey?: string;
    expandKeys?: (string | number)[];
    highlightCurrent?: boolean;
    maxHeight?: number;
    size?: "sm" | "md";
  }>(),
  {
    data: () => [],
    columns: () => [],
    stripe: true,
    size: "md",
  },
);

const emit = defineEmits<{
  select: [rows: any[]];
  sort: [prop: string, dir: "asc" | "desc"];
  "row-click": [row: any, index: number];
  "current-change": [row: any];
  expand: [keys: (string | number)[]];
}>();

// -- Selection
const selectedSet = ref(new Set<any>());

function isSelected(row: any) {
  return selectedSet.value.has(row);
}
const allSelected = computed(
  () =>
    props.data.length > 0 && props.data.every((r) => selectedSet.value.has(r)),
);

function toggleRow(row: any) {
  const s = new Set(selectedSet.value);
  s.has(row) ? s.delete(row) : s.add(row);
  selectedSet.value = s;
  emit("select", [...s]);
}

function toggleAll(val: boolean) {
  selectedSet.value = val ? new Set(props.data) : new Set();
  emit("select", [...selectedSet.value]);
}

// -- Sorting
const sortProp = ref("");
const sortDir = ref<"asc" | "desc">("asc");

function onSort(col: STableColumn) {
  const p = col.prop || col.key || "";
  if (sortProp.value === p) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortProp.value = p;
    sortDir.value = "asc";
  }
  emit("sort", sortProp.value, sortDir.value);
}

const sortedData = computed(() => {
  if (!sortProp.value) return props.data;
  const dir = sortDir.value === "asc" ? 1 : -1;
  const p = sortProp.value;
  return [...props.data].sort((a, b) => {
    const va = a[p],
      vb = b[p];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number")
      return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

// -- Expand
const expandedKeys = ref(new Set<string | number>(props.expandKeys || []));
const hasExpandColumn = computed(() =>
  props.columns.some((c) => c.type === "expand"),
);

function isExpanded(key: string | number) {
  return expandedKeys.value.has(key);
}

function toggleExpand(key: string | number) {
  const s = new Set(expandedKeys.value);
  s.has(key) ? s.delete(key) : s.add(key);
  expandedKeys.value = s;
  emit("expand", [...s]);
}

watch(
  () => props.expandKeys,
  (keys) => {
    if (keys) expandedKeys.value = new Set(keys);
  },
  { deep: true },
);

// -- Current row
const currentRow = ref<any>(null);

function onRowClick(row: any, idx: number) {
  currentRow.value = row;
  emit("row-click", row, idx);
  if (props.highlightCurrent) emit("current-change", row);
}

// -- Helpers
function colKey(col: STableColumn) {
  return col.key || col.prop || col.type || "";
}

function colStyle(col: STableColumn) {
  const s: Record<string, string> = {};
  if (col.width)
    s.width = typeof col.width === "number" ? `${col.width}px` : col.width;
  if (col.minWidth)
    s.minWidth =
      typeof col.minWidth === "number" ? `${col.minWidth}px` : col.minWidth;
  if (col.align) s.textAlign = col.align;
  return s;
}

function rowKeyFn(row: any, idx: number): string | number {
  if (props.rowKey && row[props.rowKey] != null) return row[props.rowKey];
  return idx;
}

const tableClasses = computed(() => [
  "s-table",
  props.stripe && "s-table--stripe",
  props.size === "sm" && "s-table--sm",
]);

// Preserve selection by rowKey when data changes; otherwise clear
watch(
  () => props.data,
  (newData) => {
    if (props.rowKey) {
      const oldKeys = new Set(
        [...selectedSet.value].map((r) => r[props.rowKey!]),
      );
      const kept = newData.filter((r) => oldKeys.has(r[props.rowKey!]));
      selectedSet.value = new Set(kept);
      if (kept.length !== selectedSet.value.size)
        emit("select", [...selectedSet.value]);
    } else {
      selectedSet.value = new Set();
    }
  },
);
</script>
