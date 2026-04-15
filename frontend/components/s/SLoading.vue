<template>
  <div class="s-loading-wrap">
    <slot />
    <div v-if="loading" class="s-loading-overlay">
      <span class="mdi mdi-loading mdi-spin s-loading-spinner" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ loading?: boolean }>();
</script>
