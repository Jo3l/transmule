<template>
  <div class="fts-panel">
    <div class="fts-header">
      <span class="mdi mdi-file-tree fts-header-icon" />
      <span class="fts-header-label">{{ $t("fileManager.folderTree") }}</span>
      <button class="fts-close" :title="$t('fileManager.closeFolderTree')" @click="$emit('close')">
        <span class="mdi mdi-close" />
      </button>
    </div>

    <div class="fts-scroll">
      <div v-if="loading" class="fts-loading">
        <div class="s-loading-spinner" style="width: 20px; height: 20px" />
      </div>
      <template v-else>
        <!-- Root entry -->
        <div
          class="fts-root-row"
          :class="{ 'is-active': !currentPath, 'is-drop-target': rootDragOver }"
          @click="$emit('navigate', '')"
          @contextmenu.prevent="onRootContextMenu($event)"
          @dragover.prevent="onRootDragOver"
          @dragleave="rootDragOver = false"
          @drop.prevent="onRootDrop"
        >
          <span class="mdi mdi-folder-home fts-root-icon" />
          <span class="fts-root-label">{{ $t("fileManager.root") }}</span>
        </div>
        <ul class="fts-tree">
          <FolderTreeNode
            v-for="node in tree"
            :key="node.path"
            :node="node"
            :current-path="currentPath"
            @navigate="$emit('navigate', $event)"
            @drop-transfer="emit('transfer', $event)"
            @ctx-menu="emit('ctx-menu', $event)"
          />
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

defineProps<{
  currentPath: string;
}>();

const emit = defineEmits<{
  navigate: [path: string];
  close: [];
  transfer: [payload: { sources: string[]; dest: string; copy: boolean }];
  "ctx-menu": [payload: { path: string; name: string; x: number; y: number }];
}>();

const { apiFetch } = useApi();

const tree = ref<TreeNode[]>([]);
const loading = ref(true);
const rootDragOver = ref(false);

async function loadTree() {
  loading.value = true;
  try {
    tree.value = await apiFetch<TreeNode[]>("/api/files/tree?depth=5");
  } catch {
    tree.value = [];
  } finally {
    loading.value = false;
  }
}

defineExpose({ refresh: loadTree });

onMounted(loadTree);

function onRootContextMenu(e: MouseEvent) {
  emit("ctx-menu", {
    path: "",
    name: "",
    x: Math.min(e.clientX, window.innerWidth - 210),
    y: Math.min(e.clientY, window.innerHeight - 270),
  });
}

function onRootDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes("application/x-fm-paths")) return;
  rootDragOver.value = true;
  e.dataTransfer.dropEffect = e.ctrlKey || e.shiftKey ? "copy" : "move";
}

function onRootDrop(e: DragEvent) {
  rootDragOver.value = false;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (!fmData) return;
  try {
    const sources: string[] = JSON.parse(fmData);
    emit("transfer", { sources, dest: "", copy: e.ctrlKey || e.shiftKey });
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.fts-panel {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--s-border);
  background: var(--s-bg-surface);
  min-height: 0;
  overflow: hidden;
}

.fts-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}

.fts-header-icon {
  color: var(--s-accent);
  font-size: 0.95rem;
  flex-shrink: 0;
}

.fts-header-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--s-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fts-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--s-text-muted);
  border-radius: 4px;
  font-size: 0.9rem;
  transition:
    color 0.12s,
    background 0.12s;
}

.fts-close:hover {
  color: var(--s-text);
  background: color-mix(in oklab, var(--s-text) 10%, transparent);
}

.fts-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.4rem 0.3rem;
  scrollbar-width: thin;
}

.fts-loading {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.fts-root-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.35rem;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--s-text-secondary);
  margin-bottom: 0.15rem;
  transition:
    background 0.12s,
    color 0.12s;
}

.fts-root-row:hover {
  background: color-mix(in oklab, var(--s-accent) 8%, transparent);
  color: var(--s-text);
}

.fts-root-row.is-active {
  background: color-mix(in oklab, var(--s-accent) 14%, transparent);
  color: var(--s-accent);
}

.fts-root-row.is-drop-target {
  background: color-mix(in oklab, var(--s-accent) 22%, transparent);
  outline: 2px solid var(--s-accent);
  outline-offset: -2px;
  color: var(--s-accent);
}

.fts-root-icon {
  font-size: 0.9rem;
  color: var(--s-accent);
}

.fts-root-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fts-tree {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
