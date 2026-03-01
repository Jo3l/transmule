<template>
  <div :class="['s-alert', `s-alert--${variant}`]" v-if="visible">
    <span class="mdi" :class="iconClass" />
    <span class="s-alert__text"
      ><slot>{{ title }}</slot></span
    >
    <button v-if="closable" class="s-dialog__close" @click="visible = false">
      <span class="mdi mdi-close" />
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: "error" | "success" | "warning" | "info";
    title?: string;
    closable?: boolean;
  }>(),
  {
    variant: "info",
    closable: false,
  },
);

const visible = ref(true);

const iconClass = computed(
  () =>
    ({
      error: "mdi-alert-circle",
      success: "mdi-check-circle",
      warning: "mdi-alert",
      info: "mdi-information",
    })[props.variant],
);
</script>
