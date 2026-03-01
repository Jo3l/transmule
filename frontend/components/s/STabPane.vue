<template>
  <div v-show="active">
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  name: string;
  label?: string;
  active?: boolean;
}>();
</script>
