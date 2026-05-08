<template>
  <div class="filter-header-row">
    <span>{{ label }}</span>
    <input
      :value="modelValue"
      class="header-filter-input"
      type="search"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @click.stop
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  label?: string;
  placeholder?: string;
}>();
defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<style scoped>
.filter-header-row {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  line-height: 1;
}
.header-filter-input {
  width: 130px;
  padding: 4px;
  font-size: inherit;
  font-family: inherit;
  line-height: inherit;
  margin-left: 0.5rem;
  border: 1px solid var(--s-border);
  border-radius: 3px;
  background: var(--s-input-bg, var(--s-bg));
  color: var(--s-text);
  outline: none;
  transition: border-color 0.15s;
  height: auto;
  box-sizing: border-box;
  vertical-align: middle;
}
.header-filter-input:focus {
  border-color: var(--s-accent);
}
.header-filter-input::placeholder {
  font-size: inherit;
  opacity: 0.55;
}
</style>
