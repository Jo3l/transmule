<template>
  <div id="page-shared">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("shared.title") }}</h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="doReload" :loading="loading">
          <span class="mdi mdi-refresh mr-1" /> {{ $t("shared.reload") }}
        </SButton>
      </div>
    </div>

    <!-- Totals bar -->
    <div class="box py-3 mb-4" v-if="totalsList.length > 0">
      <div class="totals-bar">
        <div class="total-item" v-for="t in totalsList" :key="t.label">
          <STag :variant="t.variant" size="sm">
            <span :class="t.icon" class="mr-1" />{{ t.label }}
          </STag>
          <strong class="ml-1">{{ t.count }}</strong>
          <span class="has-text-grey is-size-7 ml-1">{{ $t("shared.files") }}</span>
        </div>
      </div>
    </div>

    <!-- Directory tree -->
    <div class="shared-tree">
      <SLoading :loading="loading">
        <template v-if="treeItems.length > 0">
          <div
            v-for="item in treeItems"
            :key="item._key"
            class="tree-row"
            :style="{ paddingLeft: (item._depth * 20 + 8) + 'px' }"
          >
            <!-- Directory -->
            <div v-if="item._type === 'dir'" class="dir-header" @click="toggleDir(item._dirKey)">
              <span class="mdi dir-chevron" :class="item._open ? 'mdi-chevron-down' : 'mdi-chevron-right'" />
              <span class="mdi mdi-folder-outline dir-icon" />
              <span class="dir-name">{{ item.name }}</span>
              <span class="dir-count is-size-7 has-text-grey ml-1">({{ item.fileCount }})</span>
            </div>

            <!-- File -->
            <div v-else class="file-row">
              <span class="mdi mdi-file-outline file-icon" />
              <span class="file-name">{{ item.name }}</span>
              <span class="file-size is-size-7 has-text-grey ml-2">{{ item.size_fmt }}</span>
              <span class="ml-auto flex-row gap-xs">
                <STag variant="primary" size="sm" title="Soulseek">
                  <span class="mdi mdi-bird mr-1" />slskd
                </STag>
                <STag v-if="item.amuleStats" variant="warning" size="sm" title="aMule">
                  <span class="mdi mdi-donkey mr-1" />aMule
                </STag>
                <STag v-else variant="danger" size="sm" title="Missing from aMule">
                  <span class="mdi mdi-alert mr-1" />No aMule
                </STag>
              </span>
            </div>
          </div>
        </template>
        <div v-else-if="!loading" class="has-text-centered py-5 has-text-grey">
          <p v-if="!hasAnyServiceRunning">{{ $t("shared.noServicesRunning") }}</p>
          <p v-else>{{ $t("shared.noFiles") }}</p>
        </div>
      </SLoading>
    </div>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { amuleRunning, slskdRunning } = useServiceGuard();
const { t } = useI18n();
const loading = ref(false);
const rawTree = ref<any[]>([]);
const expandedDirs = ref<string[]>([]);
const totalsList = ref<any[]>([]);

const hasAnyServiceRunning = computed(() => amuleRunning.value || slskdRunning.value);

function toggleDir(dirKey: string) {
  const idx = expandedDirs.value.indexOf(dirKey);
  if (idx >= 0) {
    expandedDirs.value.splice(idx, 1);
  } else {
    expandedDirs.value.push(dirKey);
  }
  rebuildTree();
}

/** Build a flat tree list from share contents, including children when expanded */
function buildTreeList(nodes: any[], depth: number): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    const dirKey = `dir-${node.name}-${depth}`;
    const isOpen = expandedDirs.value.includes(dirKey);

    result.push({
      _key: dirKey,
      _type: 'dir',
      _depth: depth,
      _open: isOpen,
      name: node.name,
      fileCount: node.fileCount || 0,
      _dirKey: dirKey,
    });

    if (isOpen) {
      // Files
      for (const f of (node.files ?? [])) {
        result.push({
          _key: `file-${f.filename}-${depth}-${node.name}`,
          _type: 'file',
          _depth: depth + 1,
          name: f.filename,
          size_fmt: f.size_fmt,
          amuleStats: f.amuleStats || null,
        });
      }
      // Subdirectories
      const subs = buildTreeList(node.subdirectories ?? [], depth + 1);
      result.push(...subs);
    }
  }
  return result;
}

/** Compute the flat tree list reactively based on rawTree + expandedDirs */
function computeTree(): any[] {
  const allItems: any[] = [];
  for (const nodes of rawTree.value) {
    const items = buildTreeList(nodes, 0);
    allItems.push(...items);
  }
  return allItems;
}

const treeItems = ref<any[]>([]);

function rebuildTree() {
  treeItems.value = computeTree();
}

async function refresh() {
  loading.value = true;
  try {
    const data = await apiFetch<any>("/api/slskd/shares").catch(() => null);
    if (!data) {
      rawTree.value = [];
      treeItems.value = [];
      totalsList.value = [];
      return;
    }

    // Store the raw tree data (array of "contents" arrays)
    rawTree.value = (data.slskd ?? []).map((s: any) => s.contents ?? []);
    rebuildTree();

    // Build totals
    const tl: any[] = [];
    let totalFiles = 0;
    for (const share of (data.slskd ?? [])) {
      totalFiles += share.files || 0;
    }
    if (slskdRunning.value) {
      tl.push({
        label: "Soulseek",
        variant: "primary" as const,
        icon: "mdi mdi-bird",
        count: totalFiles,
      });
    }
    if (amuleRunning.value && data.amule) {
      tl.push({
        label: "aMule",
        variant: "warning" as const,
        icon: "mdi mdi-donkey",
        count: data.amule.fileCount ?? 0,
      });
    }
    totalsList.value = tl;
  } finally {
    loading.value = false;
  }
}

async function doReload() {
  loading.value = true;
  try {
    const ops: Promise<any>[] = [];
    if (amuleRunning.value) {
      ops.push(
        apiFetch("/api/amule/shared", {
          method: "POST",
          body: { action: "reload" },
        }).catch(() => {}),
      );
    }
    if (slskdRunning.value) {
      ops.push(
        apiFetch("/api/slskd/shares", {
          method: "PUT",
        }).catch(() => {}),
      );
    }
    await Promise.all(ops);
    // Wait a moment for async rescans to complete before fetching fresh data
    await new Promise((r) => setTimeout(r, 2000));
    await refresh();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped>
.share-block {
  border: 1px solid var(--s-border, #333);
  border-radius: 6px;
  overflow: hidden;
}
.tree-row {
  padding: 0.15rem 0.5rem;
}
.dir-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.1s;
  user-select: none;
  padding: 0.15rem 0;
}
.dir-header:hover {
  background: var(--s-table-hover-bg, rgba(128, 128, 128, 0.08));
}
.dir-chevron {
  font-size: 0.85rem;
  width: 1rem;
  color: var(--s-text-muted);
}
.dir-icon {
  color: var(--s-warning, #e6a817);
  font-size: 1rem;
}
.dir-name {
  font-size: 0.85rem;
  font-weight: 500;
}
.dir-count {
  font-size: 0.7rem;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  border-radius: 3px;
  padding: 0.15rem 0;
}
.file-row:hover {
  background: var(--s-table-hover-bg, rgba(128, 128, 128, 0.05));
}
.file-icon {
  color: var(--s-text-muted);
  font-size: 0.85rem;
  width: 1rem;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  flex-shrink: 0;
  white-space: nowrap;
}
.ml-auto {
  margin-left: auto;
}
.flex-row {
  display: flex;
  flex-direction: row;
}
.gap-xs {
  gap: 0.25rem;
}
</style>
