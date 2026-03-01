<template>
  <label
    :class="['s-switch', modelValue && 'is-active', disabled && 'is-disabled']"
    @click.prevent="toggle"
  >
    <span class="s-switch__track">
      <span class="s-switch__thumb" />
    </span>
    <span v-if="$slots.default" class="s-switch__label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
  }>(),
  { modelValue: false },
);

const emit = defineEmits<{ "update:modelValue": [val: boolean] }>();

function toggle() {
  if (!props.disabled) emit("update:modelValue", !props.modelValue);
}
</script>
