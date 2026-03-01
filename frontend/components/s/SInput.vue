<template>
  <div :class="['s-input-wrap', hasPrefix && 'has-prefix']">
    <span v-if="hasPrefix" class="s-input-prefix"><slot name="prefix" /></span>
    <textarea
      v-if="type === 'textarea'"
      class="s-input"
      :class="size !== 'md' && `s-input--${size}`"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :readonly="readonly"
      @input="onInput"
      @blur="$emit('blur', $event)"
    />
    <input
      v-else
      class="s-input"
      :class="size !== 'md' && `s-input--${size}`"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      @input="onInput"
      @blur="$emit('blur', $event)"
      @keyup.enter="$emit('enter')"
    />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    type?: "text" | "password" | "textarea" | "number" | "email" | "url";
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    readonly?: boolean;
    size?: "sm" | "md";
  }>(),
  {
    modelValue: "",
    type: "text",
    rows: 3,
    size: "md",
  },
);

const emit = defineEmits<{
  "update:modelValue": [val: string | number];
  blur: [e: FocusEvent];
  enter: [];
}>();

const slots = useSlots();
const hasPrefix = computed(() => !!slots.prefix);

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  emit("update:modelValue", props.type === "number" ? Number(val) : val);
}
</script>
