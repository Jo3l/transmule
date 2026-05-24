<template>
  <SButton
    :size="size"
    :variant="computedVariant"
    :loading="internalLoading"
    :disabled="isDisabled"
    :title="computedTooltip"
    v-bind="$attrs"
    @click.stop="handleClick"
  >
    <span v-if="!internalLoading && isDownloadedComputed" class="mdi mdi-check mr-1" />
    <span v-else-if="!internalLoading" class="mdi mdi-download mr-1" />
    <template v-if="label">{{ label }}</template>
    <slot v-else />
  </SButton>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();

import { titles, urls, hashes, loadDownloadHistory, reloadDownloadHistory } from "~/stores/downloadHistory";

// ── Props ────────────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  url?: string;
  hash?: string;
  service: "transmission" | "amule" | "pyload" | "direct";
  title?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "text" | "primary" | "success" | "warning" | "danger" | "info";
  label?: string;
  downloaded?: boolean;
  disabled?: boolean;
}>(), {
  size: "sm",
  variant: "primary",
});

const emit = defineEmits<{
  download: [url: string, hash: string | undefined];
  "download-start": [];
  "download-end": [];
  "download-error": [error: any];
}>();

// ── State ────────────────────────────────────────────────────────────
const internalLoading = ref(false);
const justDownloaded = ref(false);

// Load shared history singleton (first call only, subsequent are no-ops)
loadDownloadHistory();

// Watch the shared store: when titles/urls/hashes arrive or change, check if this
// button's title, URL, or hash was already downloaded.
watch(
  [titles, urls, hashes],
  () => {
    const myTitle = props.title;
    const myUrl = props.url;
    const myHash = props.hash;
    if (myTitle && titles.value.some((t: string) => t.trim() === myTitle.trim())) {
      justDownloaded.value = true;
    } else if (myUrl && urls.value.includes(myUrl)) {
      justDownloaded.value = true;
    } else if (myHash && hashes.value.includes(myHash.toLowerCase())) {
      justDownloaded.value = true;
    }
  },
  { immediate: true },
);

const isDownloadedComputed = computed(() => {
  if (justDownloaded.value) return true;
  if (props.downloaded !== undefined) return props.downloaded;
  return false;
});

const isDisabled = computed(
  () => props.disabled || internalLoading.value,
);

const computedVariant = computed(() => {
  if (isDownloadedComputed.value) return "warning";
  return props.variant;
});

const computedTooltip = computed(() => {
  if (isDownloadedComputed.value) return t("search.alreadyDownloading");
  return undefined;
});

// ── Handle click ─────────────────────────────────────────────────────
async function handleClick() {
  if (isDisabled.value) return;

  emit("download", props.url || "", props.hash);
  emit("download-start");

  internalLoading.value = true;
  try {
    if (props.service === "transmission") {
      await apiFetch("/api/transmission/torrents", {
        method: "POST",
        body: { action: "add", filename: props.url },
      });
      if (props.url) {
        // Persist to download history server, then reload the shared list
        apiFetch("/api/download-history", {
          method: "POST",
          body: { url: props.url, title: props.title || "", service: "transmission" },
        })
          .then(() => reloadDownloadHistory())
          .catch(() => {});
      }
    } else if (props.service === "amule") {
      if (props.hash) {
        await apiFetch("/api/amule/search", {
          method: "POST",
          body: { action: "download", hashes: [props.hash] },
        });
        // Persist to download history, then reload the shared list
        const historyUrl = props.url || `ed2k:${props.hash}`;
        apiFetch("/api/download-history", {
          method: "POST",
          body: { url: historyUrl, title: props.title || "", service: "amule" },
        })
          .then(() => reloadDownloadHistory())
          .catch(() => {});
      }
    } else if (props.service === "pyload") {
      if (props.url) {
        await apiFetch("/api/pyload/packages", {
          method: "POST",
          body: { action: "add", name: props.title || "Download", links: [props.url], dest: 1 },
        });
      }
    } else if (props.service === "direct") {
      if (props.url) {
        window.open(props.url, "_blank", "noopener");
      }
    }
    justDownloaded.value = true;
    emit("download-end");
  } catch (err: any) {
    emit("download-error", err);
    throw err;
  } finally {
    internalLoading.value = false;
  }
}
</script>
