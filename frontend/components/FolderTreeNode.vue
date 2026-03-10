<template>
  <li class="ftn-item" :class="{ 'is-expanded': expanded }">
    <div
      class="ftn-row"
      :class="{ 'is-active': isActive, 'is-drop-target': isDragOver }"
      draggable="true"
      @click.stop="navigate"
      @contextmenu.prevent.stop="onContextMenu"
      @dragstart.stop="onDragStart"
      @dragover.prevent.stop="onDragOver"
      @dragleave.stop="isDragOver = false"
      @drop.prevent.stop="onDrop"
    >
      <button v-if="node.children.length" class="ftn-chevron" @click.stop="expanded = !expanded">
        <span class="mdi" :class="expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'" />
      </button>
      <span v-else class="ftn-chevron-placeholder" />
      <span class="mdi mdi-folder ftn-icon" />
      <span class="ftn-name" :title="node.name">{{ node.name }}</span>
    </div>
    <ul v-if="expanded && node.children.length" class="ftn-children">
      <FolderTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :current-path="currentPath"
        @navigate="$emit('navigate', $event)"
        @drop-transfer="$emit('drop-transfer', $event)"
        @ctx-menu="$emit('ctx-menu', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

const props = defineProps<{
  node: TreeNode;
  currentPath: string;
}>();

const emit = defineEmits<{
  navigate: [path: string];
  "drop-transfer": [payload: { sources: string[]; dest: string; copy: boolean }];
  "ctx-menu": [payload: { path: string; name: string; x: number; y: number }];
}>();

const isActive = computed(() => props.currentPath === props.node.path);

const expanded = ref(
  props.currentPath === props.node.path || props.currentPath.startsWith(props.node.path + "/"),
);

watch(
  () => props.currentPath,
  (p) => {
    if (p === props.node.path || p.startsWith(props.node.path + "/")) {
      expanded.value = true;
    }
  },
);

const isDragOver = ref(false);

function navigate() {
  emit("navigate", props.node.path);
}

function onContextMenu(e: MouseEvent) {
  emit("ctx-menu", {
    path: props.node.path,
    name: props.node.name,
    x: Math.min(e.clientX, window.innerWidth - 210),
    y: Math.min(e.clientY, window.innerHeight - 270),
  });
}

function onDragStart(e: DragEvent) {
  e.dataTransfer!.effectAllowed = "copyMove";
  e.dataTransfer!.setData("application/x-fm-paths", JSON.stringify([props.node.path]));
}

function onDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes("application/x-fm-paths")) return;
  isDragOver.value = true;
  e.dataTransfer.dropEffect = e.ctrlKey || e.shiftKey ? "copy" : "move";
}

function onDrop(e: DragEvent) {
  isDragOver.value = false;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (!fmData) return;
  try {
    const sources: string[] = JSON.parse(fmData);
    emit("drop-transfer", { sources, dest: props.node.path, copy: e.ctrlKey || e.shiftKey });
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.ftn-item {
  list-style: none;
}

.ftn-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.35rem;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--s-text-secondary);
  transition:
    background 0.12s,
    color 0.12s;
  white-space: nowrap;
  overflow: hidden;
}

.ftn-row:hover {
  background: color-mix(in oklab, var(--s-accent) 8%, transparent);
  color: var(--s-text);
}

.ftn-row.is-active {
  background: color-mix(in oklab, var(--s-accent) 14%, transparent);
  color: var(--s-accent);
  font-weight: 600;
}

.ftn-row.is-drop-target {
  background: color-mix(in oklab, var(--s-accent) 22%, transparent);
  outline: 2px solid var(--s-accent);
  outline-offset: -2px;
  color: var(--s-accent);
}

.ftn-chevron {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
}

.ftn-chevron:hover {
  opacity: 1;
}

.ftn-chevron-placeholder {
  flex-shrink: 0;
  width: 18px;
}

.ftn-icon {
  flex-shrink: 0;
  font-size: 0.9rem;
  color: var(--s-accent);
  opacity: 0.8;
}

.ftn-name {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.ftn-children {
  padding: 0;
  margin: 0;
  padding-left: 1.1rem;
}
</style>
