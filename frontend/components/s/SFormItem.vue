<template>
  <div class="s-form-item">
    <label v-if="label" class="s-form-item__label">{{ label }}</label>
    <div class="s-form-item__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
