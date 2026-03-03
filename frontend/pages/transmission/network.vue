<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-lan mr-1" /> {{ $t("transmission.network.title") }}
    </h1>

    <div class="box">
      <h6 class="title is-6 mb-3">
        {{ $t("transmission.network.listeningPort") }}
      </h6>

      <SFormItem :label="$t('transmission.network.peerPort')">
        <SInputNumber
          v-model="form.peerPort"
          :min="1024"
          :max="65535"
          style="width: 140px"
          @update:model-value="save"
        />
        <SButton
          size="sm"
          class="ml-3"
          :loading="testingPort"
          @click="testPort"
        >
          <span class="mdi mdi-lan-check mr-1" />
          {{ $t("transmission.network.testPort") }}
        </SButton>
        <STag
          v-if="portTestResult !== null"
          :variant="portTestResult ? 'success' : 'danger'"
          size="sm"
          class="ml-2"
        >
          {{
            portTestResult
              ? $t("transmission.network.open")
              : $t("transmission.network.closed")
          }}
        </STag>
      </SFormItem>
      <SFormItem :label="$t('transmission.network.randomizePort')">
        <SSwitch v-model="form.randomPort" @update:model-value="save" />
      </SFormItem>
      <SFormItem :label="$t('transmission.network.enablePortForwarding')">
        <SSwitch v-model="form.portForwarding" @update:model-value="save" />
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">{{ $t("transmission.network.protocol") }}</h6>
      <SFormItem :label="$t('transmission.network.enableUtp')">
        <SSwitch v-model="form.utpEnabled" @update:model-value="save" />
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">
        {{ $t("transmission.network.peerLimits") }}
      </h6>
      <SFormItem :label="$t('transmission.network.globalPeerLimit')">
        <SInputNumber
          v-model="form.peerLimitGlobal"
          :min="1"
          :step="10"
          style="width: 140px"
          @update:model-value="save"
        />
      </SFormItem>
      <SFormItem :label="$t('transmission.network.perTorrentPeerLimit')">
        <SInputNumber
          v-model="form.peerLimitPerTorrent"
          :min="1"
          :step="5"
          style="width: 140px"
          @update:model-value="save"
        />
      </SFormItem>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch, showToast } = useApi();
const { transmissionRunning } = useServiceGuard();
const { t } = useI18n();
const loading = ref(true);
const testingPort = ref(false);
const portTestResult = ref<boolean | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  peerPort: 51413,
  randomPort: false,
  portForwarding: true,
  utpEnabled: true,
  peerLimitGlobal: 200,
  peerLimitPerTorrent: 50,
});

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");
    form.peerPort = raw["peer-port"] ?? 51413;
    form.randomPort = raw["peer-port-random-on-start"] ?? false;
    form.portForwarding = raw["port-forwarding-enabled"] ?? true;
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
        "peer-port": form.peerPort,
        "peer-port-random-on-start": form.randomPort,
        "port-forwarding-enabled": form.portForwarding,
        "utp-enabled": form.utpEnabled,
        "peer-limit-global": form.peerLimitGlobal,
        "peer-limit-per-torrent": form.peerLimitPerTorrent,
      },
    });
  } catch {
    /* useApi shows error toast */
  }
}

async function testPort() {
  testingPort.value = true;
  portTestResult.value = null;
  try {
    const res = await apiFetch<any>("/api/transmission/session", {
      method: "POST",
      body: { _action: "port-test" },
    });
    portTestResult.value = res.portIsOpen ?? false;
    showToast(
      res.portIsOpen
        ? t("transmission.network.portOpen")
        : t("transmission.network.portClosed"),
      res.portIsOpen ? "success" : "warning",
    );
  } catch {
    /* useApi shows error toast */
  } finally {
    testingPort.value = false;
  }
}

onMounted(() => fetchSession());
</script>
