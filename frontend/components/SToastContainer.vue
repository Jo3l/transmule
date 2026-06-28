<template>
  <Teleport to="body">
    <div v-if="toasts.length" class="s-toast-container">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['s-toast', `s-toast--${t.type}`, { 's-toast--persistent': t.persistent }]"
        @click="onToastClick(t)"
      >
        <span class="mdi" :class="iconFor(t.type)" />
        <span class="s-toast__body">{{ t.message }}</span>
        <button v-if="t.persistent" class="s-toast__close" @click.stop="removeToast(t.id)">
          <span class="mdi mdi-close" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Toast } from "~/composables/useToast";
const { toasts, removeToast } = useToast();

function iconFor(type: string) {
  return (
    {
      success: "mdi-check-circle",
      error: "mdi-alert-circle",
      warning: "mdi-alert",
      info: "mdi-information",
    }[type] || "mdi-information"
  );
}

function onToastClick(t: Toast) {
  if (t.onClick) {
    t.onClick(t.id);
  }
  if (!t.persistent) {
    removeToast(t.id);
  }
}
</script>
