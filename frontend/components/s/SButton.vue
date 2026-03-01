<template>
  <button
    :class="classes"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="s-btn__spinner" />
    <slot />
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?:
      | "default"
      | "primary"
      | "success"
      | "warning"
      | "danger"
      | "info"
      | "text";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    nativeType?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "default",
    size: "md",
    nativeType: "button",
  },
);

defineEmits<{ click: [e: MouseEvent] }>();

const classes = computed(() => [
  "s-btn",
  props.variant !== "default" && `s-btn--${props.variant}`,
  props.size !== "md" && `s-btn--${props.size}`,
  props.block && "s-btn--block",
]);
</script>
