<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-shield-lock mr-1" />
      {{ $t("transmission.privacy.title") }}
    </h1>

    <div class="box">
      <h6 class="title is-6 mb-3">
        {{ $t("transmission.privacy.encryption") }}
      </h6>
      <SFormItem :label="$t('transmission.privacy.encryptionMode')">
        <SSelect
          v-model="form.encryption"
          :options="encryptionOptions"
          style="width: 200px"
          @update:model-value="save"
        />
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">
        {{ $t("transmission.privacy.peerDiscovery") }}
      </h6>
      <SFormItem :label="$t('transmission.privacy.dht')">
        <SSwitch v-model="form.dhtEnabled" @update:model-value="save" />
      </SFormItem>
      <SFormItem :label="$t('transmission.privacy.pex')">
        <SSwitch v-model="form.pexEnabled" @update:model-value="save" />
      </SFormItem>
      <SFormItem :label="$t('transmission.privacy.lpd')">
        <SSwitch v-model="form.lpdEnabled" @update:model-value="save" />
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">
        {{ $t("transmission.privacy.blocklist") }}
      </h6>
      <SFormItem :label="$t('transmission.privacy.enableBlocklist')">
        <SSwitch v-model="form.blocklistEnabled" @update:model-value="save" />
      </SFormItem>

      <template v-if="form.blocklistEnabled">
        <SFormItem :label="$t('transmission.privacy.blocklistUrl')">
          <SInput
            v-model="form.blocklistUrl"
            placeholder="https://..."
            style="max-width: 400px"
            @blur="save"
          />
        </SFormItem>
        <SFormItem :label="$t('transmission.privacy.blocklistSize')">
          <span
            >{{ form.blocklistSize.toLocaleString() }}
            {{ $t("transmission.privacy.rules") }}</span
          >
          <SButton
            size="sm"
            class="ml-3"
            :loading="updatingBlocklist"
            @click="updateBlocklist"
          >
            <span class="mdi mdi-refresh mr-1" />
            {{ $t("transmission.privacy.updateNow") }}
          </SButton>
        </SFormItem>
      </template>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch, showToast } = useApi();
const { transmissionRunning } = useServiceGuard();
const { t } = useI18n();
const loading = ref(true);
const updatingBlocklist = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  encryption: "preferred",
  dhtEnabled: true,
  pexEnabled: true,
  lpdEnabled: false,
  blocklistEnabled: false,
  blocklistUrl: "",
  blocklistSize: 0,
});

const encryptionOptions = computed(() => [
  { label: t("transmission.privacy.preferEncryption"), value: "preferred" },
  { label: t("transmission.privacy.requireEncryption"), value: "required" },
  { label: t("transmission.privacy.allowUnencrypted"), value: "tolerated" },
]);

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");
    form.encryption = raw.encryption || "preferred";
    form.dhtEnabled = raw["dht-enabled"] ?? true;
    form.pexEnabled = raw["pex-enabled"] ?? true;
    form.lpdEnabled = raw["lpd-enabled"] ?? false;
    form.blocklistEnabled = raw["blocklist-enabled"] ?? false;
    form.blocklistUrl = raw["blocklist-url"] || "";
    form.blocklistSize = raw["blocklist-size"] || 0;
  } finally {
    loading.value = false;
  }
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

async function doSave() {
  try {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        encryption: form.encryption,
        "dht-enabled": form.dhtEnabled,
        "pex-enabled": form.pexEnabled,
        "lpd-enabled": form.lpdEnabled,
        "blocklist-enabled": form.blocklistEnabled,
        "blocklist-url": form.blocklistUrl,
      },
    });
  } catch {
    /* useApi shows error toast */
  }
}

async function updateBlocklist() {
  updatingBlocklist.value = true;
  try {
    const res = await apiFetch<any>("/api/transmission/session", {
      method: "POST",
      body: { _action: "blocklist-update" },
    });
    form.blocklistSize = res.blocklistSize || 0;
    showToast(
      t("transmission.privacy.blocklistUpdated", {
        n: form.blocklistSize.toLocaleString(),
      }),
      "success",
    );
  } catch {
    /* useApi shows error toast */
  } finally {
    updatingBlocklist.value = false;
  }
}

onMounted(() => fetchSession());
</script>
