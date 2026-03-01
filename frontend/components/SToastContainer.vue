<template>
  <Teleport to="body">
    <div v-if="toasts.length" class="s-toast-container">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['s-toast', `s-toast--${t.type}`]"
        @click="removeToast(t.id)"
      >
        <span class="mdi" :class="iconFor(t.type)" />
        {{ t.message }}
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
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
</script>
