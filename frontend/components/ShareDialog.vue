<template>
  <SDialog
    :model-value="modelValue"
    :title="$t('share.title')"
    width="560px"
    @update:model-value="close"
  >
    <div class="share-dialog">
      <p class="share-dialog__items">
        <span class="mdi mdi-file-multiple-outline mr-1" />
        {{ itemsLabel }}
      </p>

      <!-- Options (before creating) -->
      <template v-if="!created">
        <div class="share-dialog__row">
          <label class="share-dialog__label">{{ $t("share.expiry") }}</label>
          <div class="share-dialog__choices">
            <button
              v-for="option in expiryOptions"
              :key="option.value"
              type="button"
              class="share-dialog__choice"
              :class="{ 'share-dialog__choice--active': expiry === option.value }"
              @click="expiry = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="share-dialog__row">
          <label class="share-dialog__label">{{ $t("share.useCode") }}</label>
          <SSwitch v-model="withCode" />
        </div>

        <p class="share-dialog__hint">{{ $t("share.codeHint") }}</p>
      </template>

      <!-- Result -->
      <template v-else>
        <div class="share-dialog__qr" v-html="qrSvg" />
        <p class="share-dialog__scan">{{ $t("share.scan") }}</p>

        <div class="share-dialog__field">
          <span class="share-dialog__field-label">{{ $t("share.url") }}</span>
          <div class="share-dialog__field-row">
            <code class="share-dialog__value">{{ shareUrlValue }}</code>
            <SButton icon="mdi-content-copy" variant="text" @click="copy(shareUrlValue, 'share.urlCopied')" />
          </div>
        </div>

        <div v-if="created.code" class="share-dialog__field">
          <span class="share-dialog__field-label">{{ $t("share.code") }}</span>
          <div class="share-dialog__field-row">
            <code class="share-dialog__code">{{ created.code }}</code>
            <SButton icon="mdi-content-copy" variant="text" @click="copy(created.code!, 'share.codeCopied')" />
          </div>
        </div>

        <p class="share-dialog__expiry">
          {{ $t("share.expiresAt") }}: {{ expiryLabel }}
        </p>
      </template>

      <p v-if="isLocal" class="share-dialog__warning">
        <span class="mdi mdi-alert-outline mr-1" />{{ $t("share.localhostWarning") }}
      </p>
      <p v-if="error" class="share-dialog__error">{{ error }}</p>
    </div>

    <template #footer>
      <template v-if="!created">
        <SButton variant="text" @click="close(false)">{{ $t("common.cancel") }}</SButton>
        <SButton variant="primary" :loading="loading" @click="create()">
          {{ $t("share.generate") }}
        </SButton>
      </template>
      <template v-else>
        <SButton variant="danger" :loading="revoking" @click="revoke()">
          {{ $t("share.revoke") }}
        </SButton>
        <SButton variant="text" :loading="loading" @click="regenerate()">
          {{ $t("share.regenerate") }}
        </SButton>
        <SButton variant="primary" @click="close(true)">{{ $t("common.close") }}</SButton>
      </template>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
import qrcode from "qrcode-generator";

interface ShareResponse {
  id: string;
  token: string;
  code: string | null;
  kind: "file" | "folder" | "selection";
  label: string;
  roots: string[];
  expiresAt: string;
}

const props = defineProps<{
  modelValue: boolean;
  paths: string[];
}>();

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const { apiFetch, showToast } = useApi();
const { t } = useI18n();
const shareUrl = useShareUrl();

const loading = ref(false);
const revoking = ref(false);
const error = ref("");
const created = ref<ShareResponse | null>(null);
const expiry = ref<"1h" | "24h" | "7d">("24h");
const withCode = ref(true);

const expiryOptions = computed(() => [
  { value: "1h" as const, label: t("share.expiry1h") },
  { value: "24h" as const, label: t("share.expiry24h") },
  { value: "7d" as const, label: t("share.expiry7d") },
]);

const isLocal = computed(() => shareUrlIsLocal());

const itemsLabel = computed(() => {
  const names = props.paths.map((path) => path.split("/").filter(Boolean).pop() ?? path);
  if (names.length === 1) return names[0];
  return t("share.itemsSelected", { count: names.length });
});

const shareUrlValue = computed(() => (created.value ? shareUrl(created.value.token) : ""));

const qrSvg = computed(() => {
  if (!created.value) return "";
  const qr = qrcode(0, "M");
  qr.addData(shareUrlValue.value);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
});

const expiryLabel = computed(() => {
  if (!created.value) return "";
  return new Date(created.value.expiresAt).toLocaleString();
});

// Fresh dialog every time it opens: no stale links from a previous share.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    created.value = null;
    error.value = "";
    loading.value = false;
    revoking.value = false;
    expiry.value = "24h";
    withCode.value = true;
  },
);

function close(value = false) {
  emit("update:modelValue", value);
}

async function create() {
  error.value = "";
  loading.value = true;
  try {
    created.value = await apiFetch<ShareResponse>("/api/share", {
      method: "POST",
      body: { paths: props.paths, withCode: withCode.value, expiresIn: expiry.value },
    });
  } catch (err: any) {
    error.value = err?.data?.statusMessage || t("share.error");
  } finally {
    loading.value = false;
  }
}

async function revoke() {
  if (!created.value) return;
  revoking.value = true;
  try {
    await apiFetch(`/api/share/${created.value.id}`, { method: "DELETE" });
    showToast(t("share.revoked"), "success");
    created.value = null;
  } catch {
    showToast(t("share.error"), "error");
  } finally {
    revoking.value = false;
  }
}

async function regenerate() {
  if (!created.value) return;
  revoking.value = true;
  try {
    await apiFetch(`/api/share/${created.value.id}`, { method: "DELETE" });
  } catch {
    /* the link may already be gone; creating a new one is what matters */
  } finally {
    revoking.value = false;
  }
  await create();
}

async function copy(value: string, messageKey: string) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(t(messageKey), "success", 3000);
  } catch {
    showToast(t("common.copyFailed"), "error");
  }
}
</script>

<style scoped>
.share-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.share-dialog__items {
  font-weight: 600;
  color: var(--text-strong, #e5e7eb);
}

.share-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.share-dialog__label {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
}

.share-dialog__choices {
  display: flex;
  gap: 0.35rem;
}

.share-dialog__choice {
  padding: 0.3rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border, #374151);
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.share-dialog__choice--active {
  border-color: #22d3ee;
  color: #22d3ee;
}

.share-dialog__hint,
.share-dialog__scan,
.share-dialog__expiry {
  font-size: 0.78rem;
  color: var(--text-muted, #9ca3af);
  text-align: center;
}

.share-dialog__qr {
  display: flex;
  justify-content: center;
  background: #fff;
  border-radius: 12px;
  padding: 0.75rem;
  width: fit-content;
  margin: 0 auto;
}

.share-dialog__qr :deep(svg) {
  /* Shrinks on short viewports so the footer buttons stay reachable. */
  width: min(200px, 30vh);
  height: min(200px, 30vh);
  display: block;
}

.share-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.share-dialog__field-label {
  font-size: 0.78rem;
  color: var(--text-muted, #9ca3af);
}

.share-dialog__field-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.share-dialog__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.share-dialog__code {
  font-size: 1.6rem;
  letter-spacing: 0.35rem;
  font-weight: 700;
  color: #22d3ee;
}

.share-dialog__warning {
  font-size: 0.78rem;
  color: #fbbf24;
}

.share-dialog__error {
  font-size: 0.8rem;
  color: #f87171;
}
</style>
