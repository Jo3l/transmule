<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="s-dialog-overlay"
      @mousedown.self="overlayMousedown"
      @mouseup.self="overlayMouseup"
    >
      <div class="s-dialog" :style="{ width }" @mousedown.stop="dialogMousedown">
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
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    title?: string;
    width?: string;
  }>(),
  {
    modelValue: false,
    title: "",
    width: "500px",
  },
);

const emit = defineEmits<{ "update:modelValue": [val: boolean] }>();

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
