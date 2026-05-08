<template>
  <div v-if="totalPages > 1" class="s-pagination">
    <SButton
      size="sm"
      variant="default"
      :disabled="modelValue <= 1"
      @click="go(modelValue - 1)"
    >
      <span class="mdi mdi-chevron-left" />
    </SButton>
    <span class="s-pagination__info">{{ modelValue }} / {{ totalPages }}</span>
    <SButton
      size="sm"
      variant="default"
      :disabled="modelValue >= totalPages"
      @click="go(modelValue + 1)"
    >
      <span class="mdi mdi-chevron-right" />
    </SButton>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: number;
  total: number;
  pageSize?: number;
}>(), { pageSize: 50 });

const emit = defineEmits<{ "update:modelValue": [val: number] }>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

function go(p: number) {
  emit("update:modelValue", Math.max(1, Math.min(p, totalPages.value)));
}
</script>

<style scoped>
.s-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
}
.s-pagination__info {
  font-size: 0.8rem;
  color: var(--s-text-secondary, #888);
  min-width: 5rem;
  text-align: center;
}
</style>
