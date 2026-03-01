<template>
  <div class="s-input-number">
    <button type="button" @click="decrement" :disabled="disabled || atMin">
      −
    </button>
    <input
      :value="displayValue"
      :disabled="disabled"
      @change="onChange"
      @blur="onBlur"
    />
    <button type="button" @click="increment" :disabled="disabled || atMax">
      +
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: number;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    disabled?: boolean;
  }>(),
  {
    modelValue: 0,
    min: -Infinity,
    max: Infinity,
    step: 1,
    precision: 0,
  },
);

const emit = defineEmits<{ "update:modelValue": [val: number] }>();

const atMin = computed(() => props.modelValue <= props.min);
const atMax = computed(() => props.modelValue >= props.max);

const displayValue = computed(() =>
  props.precision > 0
    ? props.modelValue.toFixed(props.precision)
    : String(props.modelValue),
);

function clamp(n: number) {
  return Math.min(props.max, Math.max(props.min, n));
}

function round(n: number) {
  if (props.precision > 0) {
    const f = Math.pow(10, props.precision);
    return Math.round(n * f) / f;
  }
  return Math.round(n);
}

function increment() {
  emit("update:modelValue", round(clamp(props.modelValue + props.step)));
}
function decrement() {
  emit("update:modelValue", round(clamp(props.modelValue - props.step)));
}

function onChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (!isNaN(v)) emit("update:modelValue", round(clamp(v)));
}

function onBlur(e: Event) {
  (e.target as HTMLInputElement).value = displayValue.value;
}
</script>
