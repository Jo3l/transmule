<template>
  <div class="s-select">
    <select :value="modelValue" :disabled="disabled" @change="onChange">
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="opt in normalizedOptions"
        :key="opt.value"
        :value="opt.value"
      >
        {{ opt.label }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
type OptionItem = { label: string; value: string | number } | string;

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    options?: OptionItem[];
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
  }>(),
  {
    modelValue: "",
    options: () => [],
  },
);

const emit = defineEmits<{ "update:modelValue": [val: string | number] }>();

const normalizedOptions = computed(() =>
  props.options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o,
  ),
);

function onChange(e: Event) {
  emit("update:modelValue", (e.target as HTMLSelectElement).value);
}
</script>
