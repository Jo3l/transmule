<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="s-context-menu"
      :style="{ top: y + 'px', left: x + 'px' }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    x: number;
    y: number;
  }>(),
  {
    visible: false,
    x: 0,
    y: 0,
  },
);

const emit = defineEmits<{
  close: [];
}>();

function onDocumentClick(e: MouseEvent) {
  if (!props.visible) return;
  const el = (e.target as HTMLElement).closest(".s-context-menu");
  if (!el) emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.visible) {
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>
