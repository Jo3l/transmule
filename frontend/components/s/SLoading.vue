<template>
  <div class="s-loading-wrap">
    <slot />
    <div v-if="loading" class="s-loading-overlay">
      <div class="s-loading-spinner" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ loading?: boolean }>();
</script>
