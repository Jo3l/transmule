<template>
  <ul id="comp-stats-tree" class="stats-tree">
    <li v-for="(node, i) in nodes" :key="i">
      <template v-if="node.type === 'folder'">
        <span class="folder-toggle" @click="toggle(i)">
          <span
            class="mdi"
            :class="expanded[i] ? 'mdi-chevron-down' : 'mdi-chevron-right'"
          ></span>
          <strong>{{ node.label }}</strong>
        </span>
        <StatsTree v-if="expanded[i] && node.children" :nodes="node.children" />
      </template>
      <template v-else>
        <span class="tree-item">
          <span class="mdi mdi-circle-small"></span>
          {{ node.label }}
        </span>
      </template>
    </li>
  </ul>
</template>

<script setup lang="ts">
const props = defineProps<{
  nodes: Array<{ type: string; label: string; children?: any[] }>;
}>();

const expanded = ref<Record<number, boolean>>({});

// Expand first level by default
onMounted(() => {
  props.nodes.forEach((_, i) => {
    expanded.value[i] = true;
  });
});

function toggle(i: number) {
  expanded.value[i] = !expanded.value[i];
}
</script>

<style scoped>
.stats-tree {
  list-style: none;
  padding-left: 1.2rem;
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.8;
}

.folder-toggle {
  cursor: pointer;
  user-select: none;
}

.folder-toggle:hover {
  color: #3273dc;
}

.tree-item {
  color: #4a4a4a;
}
</style>
