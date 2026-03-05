<template>
  <div class="folder-picker">
    <!-- Breadcrumb path display -->
    <div class="fp-breadcrumb">
      <span class="fp-crumb fp-crumb--root" @click="goto('')">
        <span class="mdi mdi-folder-home" />
      </span>
      <template v-for="(seg, i) in segments" :key="i">
        <span class="fp-sep">/</span>
        <span class="fp-crumb" @click="goto(segments.slice(0, i + 1).join('/'))">{{ seg }}</span>
      </template>
    </div>

    <!-- Tree -->
    <div class="fp-tree">
      <div v-if="loading" class="fp-loading">
        <SLoading />
      </div>
      <template v-else>
        <!-- Go up -->
        <div v-if="currentPath" class="fp-row fp-row--up" @click="goUp">
          <span class="mdi mdi-arrow-up-bold-circle fp-icon" />
          <span class="fp-name has-text-grey">{{ $t("fileManager.goUp") }}</span>
        </div>

        <!-- Directories only -->
        <div
          v-for="dir in dirs"
          :key="dir.name"
          class="fp-row"
          :class="{ 'fp-row--selected': selected === fullPath(dir.name) }"
          @click="select(dir.name)"
          @dblclick="goto(fullPath(dir.name))"
        >
          <span class="mdi mdi-folder fp-icon fp-icon--dir" />
          <span class="fp-name">{{ dir.name }}</span>
          <span class="mdi mdi-chevron-right fp-chevron" @click.stop="goto(fullPath(dir.name))" />
        </div>

        <div v-if="!dirs.length" class="fp-empty has-text-grey is-size-7">
          {{ $t("fileManager.empty") }}
        </div>
      </template>
    </div>

    <!-- Selected path indicator -->
    <div class="fp-selected-bar">
      <span class="mdi mdi-folder-check mr-1 has-text-accent" />
      <span class="fp-selected-path is-size-7">{{ selected || "/" }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface DirItem {
  name: string;
}

const props = defineProps<{
  /** The currently chosen destination path (relative). Two-way via v-model. */
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();

const { apiFetch } = useApi();

const currentPath = ref("");
const dirs = ref<DirItem[]>([]);
const loading = ref(false);

const selected = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const segments = computed(() =>
  currentPath.value ? currentPath.value.split("/").filter(Boolean) : [],
);

function fullPath(name: string) {
  return currentPath.value ? `${currentPath.value}/${name}` : name;
}

function select(name: string) {
  selected.value = fullPath(name);
}

async function goto(path: string) {
  currentPath.value = path;
  selected.value = path;
  await load();
}

function goUp() {
  const segs = segments.value.slice(0, -1);
  goto(segs.join("/"));
}

async function load() {
  loading.value = true;
  try {
    const res = await apiFetch<{ items: { name: string; type: string }[] }>(
      `/api/files/list?path=${encodeURIComponent(currentPath.value)}`,
    );
    dirs.value = res.items.filter((i) => i.type === "directory").map((i) => ({ name: i.name }));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // Start browsing from the parent of the initial selected path
  const initial = props.modelValue ? props.modelValue.split("/").slice(0, -1).join("/") : "";
  currentPath.value = initial;
  load();
});
</script>

<style scoped>
.folder-picker {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  overflow: hidden;
}

.fp-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.75rem;
  background: var(--s-bg-surface-alt);
  border-bottom: 1px solid var(--s-border);
  font-size: 0.8rem;
  flex-wrap: wrap;
}
.fp-crumb {
  cursor: pointer;
  color: var(--s-accent);
  &:hover {
    text-decoration: underline;
  }
}
.fp-crumb--root {
  font-size: 1rem;
}
.fp-sep {
  color: var(--s-text-muted);
}

.fp-tree {
  flex: 1;
  max-height: 260px;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.fp-loading {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.fp-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: var(--s-bg-hover);
  }
  &.fp-row--up {
    opacity: 0.7;
  }
  &.fp-row--selected {
    background: var(--s-accent-subtle);
  }
}
.fp-icon {
  font-size: 1rem;
  color: var(--s-text-muted);
}
.fp-icon--dir {
  color: var(--s-warning);
}
.fp-name {
  flex: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-chevron {
  font-size: 0.9rem;
  color: var(--s-text-muted);
  opacity: 0.6;
  &:hover {
    opacity: 1;
  }
}
.fp-empty {
  padding: 0.75rem;
  text-align: center;
}

.fp-selected-bar {
  display: flex;
  align-items: center;
  padding: 0.4rem 0.75rem;
  background: var(--s-bg-surface-alt);
  border-top: 1px solid var(--s-border);
  gap: 0.3rem;
  overflow: hidden;
}
.fp-selected-path {
  color: var(--s-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
