<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="overlayRef"
      tabindex="-1"
      class="s-dialog-overlay"
      @mousedown.self="overlayMousedown"
      @mouseup.self="overlayMouseup"
      @keydown.escape="close"
    >
      <div class="s-dialog" :style="{ width: dialogWidth }" @mousedown.stop="dialogMousedown">
        <div class="s-dialog__header">
          <span>{{ title }}</span>
          <button class="s-dialog__close" @click="close">
            <span class="mdi mdi-close" />
          </button>
        </div>
        <div class="s-dialog__body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="s-dialog__footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    title?: string;
    /** Ancho explícito (p.ej. "480px"). Tiene prioridad sobre `size`. */
    width?: string;
    /**
     * Tamaño predefinido: sm=400px, md=500px, lg=920px, xl=1400px.
     * Si se pasa `width`, este prop se ignora.
     */
    size?: "sm" | "md" | "lg" | "xl";
  }>(),
  {
    modelValue: false,
    title: "",
    width: "",
    size: "md",
  },
);

const SIZE_WIDTHS: Record<NonNullable<typeof props.size>, string> = {
  sm: "400px",
  md: "500px",
  lg: "920px",
  xl: "1400px",
};

const dialogWidth = computed<string>(() => props.width || SIZE_WIDTHS[props.size]);

const emit = defineEmits<{ "update:modelValue": [val: boolean] }>();

const overlayRef = ref<HTMLElement | null>(null);

// Auto-focus the overlay when dialog opens so Escape key works immediately
watch(() => props.modelValue, (val) => {
  if (val) {
    nextTick(() => overlayRef.value?.focus());
  }
});

// Only close when both mousedown AND mouseup happen on the overlay itself,
// not when the user starts a drag inside the dialog and releases outside.
let mousedownOnOverlay = false;

function overlayMousedown() {
  mousedownOnOverlay = true;
}

function dialogMousedown() {
  mousedownOnOverlay = false;
}

function overlayMouseup() {
  if (mousedownOnOverlay) close();
  mousedownOnOverlay = false;
}

function close() {
  emit("update:modelValue", false);
}
</script>
