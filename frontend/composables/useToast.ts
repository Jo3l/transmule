import { ref } from "vue";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
  persistent?: boolean;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  function showToast(
    message: string,
    type: Toast["type"] = "info",
    duration = 3000,
    persistent = false,
  ) {
    const id = nextId++;
    toasts.value.push({ id, message, type, persistent });
    if (!persistent && duration > 0) {
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id);
      }, duration);
    }
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, showToast, addToast: showToast, removeToast };
}
