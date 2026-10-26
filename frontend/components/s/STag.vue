<template>
  <span :class="classes"><slot /></span>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: STagVariant;
    size?: "sm" | "md" | "lg";
  }>(),
  { variant: "default", size: "md" },
);

const classes = computed(() => [
  "s-tag",
  props.variant !== "default" && `s-tag--${props.variant}`,
  props.size !== "md" && `s-tag--${props.size}`,
]);
</script>
