<template>
  <div :class="tabsClasses">
    <div class="s-tabs__nav">
      <button
        v-for="pane in panes"
        :key="pane.name"
        :class="['s-tabs__tab', modelValue === pane.name && 'is-active']"
        @click="$emit('update:modelValue', pane.name)"
      >
        <slot :name="`tab-${pane.name}`">{{ pane.label }}</slot>
      </button>
    </div>
    <div class="s-tabs__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
export interface TabPaneDef {
  name: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    variant?: "default" | "card";
    panes?: TabPaneDef[];
  }>(),
  {
    modelValue: "",
    variant: "default",
    panes: () => [],
  },
);

defineEmits<{ "update:modelValue": [val: string] }>();

const tabsClasses = computed(() => [
  "s-tabs",
  props.variant === "card" && "s-tabs--card",
]);
</script>
