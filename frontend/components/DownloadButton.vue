<template>
  <!-- aMule mode: hide button, show check when downloaded -->
  <span
    v-if="service === 'amule' && hideWhenDownloaded && isDownloaded"
    class="mdi mdi-check has-text-success"
    :title="t('search.alreadyDownloading')"
  />
  <SButton
    v-else
    :size="size"
    :variant="computedVariant"
    :loading="internalLoading"
    :disabled="isDisabled"
    :title="computedTooltip"
    v-bind="$attrs"
    @click.stop="handleClick"
  >
    <span v-if="isDownloaded" class="mdi mdi-check mr-1" />
    <span v-else class="mdi mdi-download mr-1" />
    <template v-if="label">{{ label }}</template>
    <slot v-else />
  </SButton>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();
const { isDownloaded: _isDownloaded, isDownloadedByHash, recordDownload } = useDownloadHistory();

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
  hideWhenDownloaded?: boolean;
}>(), {
  size: "sm",
  variant: "success",
});

const emit = defineEmits<{
  download: [url: string, hash: string | undefined];
  "download-start": [];
  "download-end": [];
  "download-error": [error: any];
}>();

const internalLoading = ref(false);
const justDownloaded = ref(false);

const isDownloaded = computed(() => {
  if (props.downloaded !== undefined) return props.downloaded;
  if (justDownloaded.value) return true;
  if (props.service === "transmission") {
    if (props.url && _isDownloaded(props.url)) return true;
    if (props.hash && isDownloadedByHash(props.hash)) return true;
  }
  return false;
});

const isDisabled = computed(
  () => props.disabled || internalLoading.value || isDownloaded.value,
);

const computedVariant = computed(() => {
  if (isDownloaded.value) return "warning";
  return props.variant;
});

const computedTooltip = computed(() => {
  if (isDownloaded.value) return t("search.alreadyDownloading");
  return undefined;
});

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
        await recordDownload(props.url, props.title || "", "transmission");
      }
    } else if (props.service === "amule") {
      if (props.hash) {
        await apiFetch("/api/amule/search", {
          method: "POST",
          body: { action: "download", hashes: [props.hash] },
        });
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
