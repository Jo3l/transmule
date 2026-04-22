<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-lan mr-1" /> {{ $t("transmission.network.title") }}
    </h1>

    <div class="box">
      <h6 class="title is-6 mb-3 mt-3">{{ $t("transmission.network.protocol") }}</h6>
      <SFormItem :label="$t('transmission.network.enableUtp')">
        <SSwitch v-model="form.utpEnabled" @update:model-value="save" />
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3 mt-3">
        {{ $t("transmission.network.peerLimits") }}
      </h6>
      <SFormItem :label="$t('transmission.network.globalPeerLimit')">
        <SInputNumber
          v-model="form.peerLimitGlobal"
          :min="1"
          :step="10"
          class="w-140"
          @update:model-value="save"
        />
      </SFormItem>
      <SFormItem :label="$t('transmission.network.perTorrentPeerLimit')">
        <SInputNumber
          v-model="form.peerLimitPerTorrent"
          :min="1"
          :step="5"
          class="w-140"
          @update:model-value="save"
        />
      </SFormItem>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const loading = ref(true);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  utpEnabled: true,
  peerLimitGlobal: 200,
  peerLimitPerTorrent: 50,
});

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");
    form.utpEnabled = raw["utp-enabled"] ?? true;
    form.peerLimitGlobal = raw["peer-limit-global"] ?? 200;
    form.peerLimitPerTorrent = raw["peer-limit-per-torrent"] ?? 50;
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
        "utp-enabled": form.utpEnabled,
        "peer-limit-global": form.peerLimitGlobal,
        "peer-limit-per-torrent": form.peerLimitPerTorrent,
      },
    });
  } catch {
    /* useApi shows error toast */
  }
}

onMounted(() => fetchSession());
</script>
