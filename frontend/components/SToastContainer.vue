<template>
  <Teleport to="body">
    <div v-if="toasts.length" class="s-toast-container">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['s-toast', `s-toast--${t.type}`, { 's-toast--persistent': t.persistent }]"
        @click="!t.persistent && removeToast(t.id)"
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
