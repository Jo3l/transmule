<template>
  <label
    :class="[
      's-checkbox',
      modelValue && 'is-checked',
      disabled && 'is-disabled',
    ]"
    @click.prevent="toggle"
  >
    <span class="s-checkbox__box">
      <span v-if="modelValue" class="mdi mdi-check" />
    </span>
    <span v-if="label || $slots.default">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    label?: string;
    disabled?: boolean;
  }>(),
  { modelValue: false },
);

const emit = defineEmits<{ "update:modelValue": [val: boolean] }>();

function toggle() {
  if (!props.disabled) emit("update:modelValue", !props.modelValue);
}
</script>
