<template>
  <div id="comp-connection-status" class="flex-center gap-md">
    <template v-if="loaded">
      <!-- aMule middleware connection -->
      <STag :variant="amuleVariant" size="sm">
        <span class="mdi mdi-donkey mr-1" />
        {{ $t("connection.amule") }}: {{ amuleLabel }}
      </STag>
      <!-- ED2K -->
      <STag v-if="status" :variant="ed2kVariant" size="sm">
        <span class="mdi mdi-server-network mr-1" />
        {{ $t("connection.ed2k") }}:
        {{ status.ed2k?.label || $t("connection.unknown") }}
      </STag>
      <!-- KAD -->
      <STag v-if="status" :variant="kadVariant" size="sm">
        <span class="mdi mdi-wan mr-1" />
        {{ $t("connection.kad") }}:
        {{ status.kad?.label || $t("connection.unknown") }}
      </STag>
      <!-- Transmission middleware connection -->
      <STag :variant="transmissionVariant" size="sm">
        <span class="mdi mdi-magnet mr-1" />
        {{ $t("connection.transmission") }}: {{ transmissionLabel }}
      </STag>
      <!-- pyLoad middleware connection -->
      <STag :variant="pyloadVariant" size="sm">
        <span class="mdi mdi-cloud-download mr-1" />
        {{ $t("connection.pyload") }}: {{ pyloadLabel }}
      </STag>
    </template>
    <STag v-else variant="info" size="sm">
      <span class="mdi mdi-loading mdi-spin mr-1" />
      {{ $t("connection.connecting") }}
    </STag>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();
const loaded = ref(false);
const status = ref<any>(null);
const amuleOk = ref(false);
const transmissionOk = ref(false);
const pyloadOk = ref(false);

const amuleVariant = computed(() => (amuleOk.value ? "success" : "danger"));
const amuleLabel = computed(() =>
  amuleOk.value ? t("connection.connected") : t("connection.disconnected"),
);

const transmissionVariant = computed(() =>
  transmissionOk.value ? "success" : "danger",
);
const transmissionLabel = computed(() =>
  transmissionOk.value
    ? t("connection.connected")
    : t("connection.disconnected"),
);

const pyloadVariant = computed(() => (pyloadOk.value ? "success" : "danger"));
const pyloadLabel = computed(() =>
  pyloadOk.value ? t("connection.connected") : t("connection.disconnected"),
);

const ed2kVariant = computed(() => {
  if (status.value?.ed2k?.connected) return "success";
  if (status.value?.ed2k?.status === "connecting") return "warning";
  return "danger";
});

const kadVariant = computed(() => {
  if (status.value?.kad?.connected && !status.value?.kad?.firewalled)
    return "success";
  if (status.value?.kad?.firewalled) return "warning";
  return "danger";
});

let interval: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  const [amuleRes, trRes, pyRes] = await Promise.allSettled([
    apiFetch<any>("/api/amule/stats"),
    apiFetch<any>("/api/transmission/session"),
    apiFetch<any>("/api/pyload/status"),
  ]);

  if (amuleRes.status === "fulfilled" && amuleRes.value) {
    amuleOk.value = true;
    status.value = amuleRes.value?.connection_status || null;
  } else {
    amuleOk.value = false;
    status.value = null;
  }

  transmissionOk.value = trRes.status === "fulfilled" && !!trRes.value?.session;
  pyloadOk.value =
    pyRes.status === "fulfilled" && pyRes.value?.connected === true;

  loaded.value = true;
}

onMounted(() => {
  refresh();
  interval = setInterval(refresh, 15000);
});

onUnmounted(() => {
  if (interval) clearInterval(interval);
});
</script>
