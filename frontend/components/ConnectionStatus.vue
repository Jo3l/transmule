<template>
  <div id="comp-connection-status" class="flex-center gap-md">
    <template v-if="loaded">
      <!-- aMule + ED2K + KAD compact status -->
      <STag :variant="amuleStackVariant" size="sm">
        <span class="mdi mdi-donkey mr-1" />
        {{ $t("connection.amule") }}
        <span class="ml-1" :title="amuleStateLabel">
          <span :class="amuleStateIcon" />
        </span>
        <span class="ml-2" :title="ed2kStateLabel">
          {{ $t("connection.ed2k") }}
          <span class="ml-1" :class="ed2kStateIcon" />
        </span>
        <span class="ml-2" :title="kadStateLabel">
          {{ $t("connection.kad") }}
          <span class="ml-1" :class="kadStateIcon" />
        </span>
      </STag>
      <!-- Transmission middleware connection -->
      <STag :variant="transmissionVariant" size="sm">
        <span class="mdi mdi-magnet mr-1" />
        {{ $t("connection.transmission") }}
        <span class="ml-1" :title="transmissionStateLabel">
          <span :class="transmissionStateIcon" />
        </span>
      </STag>
      <!-- pyLoad middleware connection -->
      <STag :variant="pyloadVariant" size="sm">
        <span class="mdi mdi-cloud-download mr-1" />
        {{ $t("connection.pyload") }}
        <span class="ml-1" :title="pyloadStateLabel">
          <span :class="pyloadStateIcon" />
        </span>
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

type ConnectionState =
  | "connected"
  | "disconnected"
  | "connecting"
  | "unknown"
  | "firewalled";

function stateIcon(state: ConnectionState): string {
  if (state === "connected") return "mdi mdi-check-circle";
  if (state === "connecting") return "mdi mdi-progress-clock";
  if (state === "firewalled") return "mdi mdi-shield-alert";
  if (state === "unknown") return "mdi mdi-help-circle-outline";
  return "mdi mdi-close-circle";
}

function stateLabel(state: ConnectionState): string {
  if (state === "firewalled") return t("connection.firewalled");
  return t(`connection.${state}`);
}

const amuleState = computed<ConnectionState>(() =>
  amuleOk.value ? "connected" : "disconnected",
);
const amuleStateIcon = computed(() => stateIcon(amuleState.value));
const amuleStateLabel = computed(() => stateLabel(amuleState.value));

const transmissionVariant = computed(() =>
  transmissionOk.value ? "success" : "danger",
);
const transmissionState = computed<ConnectionState>(() =>
  transmissionOk.value ? "connected" : "disconnected",
);
const transmissionStateIcon = computed(() => stateIcon(transmissionState.value));
const transmissionStateLabel = computed(() => stateLabel(transmissionState.value));

const pyloadVariant = computed(() => (pyloadOk.value ? "success" : "danger"));
const pyloadState = computed<ConnectionState>(() =>
  pyloadOk.value ? "connected" : "disconnected",
);
const pyloadStateIcon = computed(() => stateIcon(pyloadState.value));
const pyloadStateLabel = computed(() => stateLabel(pyloadState.value));

const ed2kState = computed<ConnectionState>(() => {
  if (!status.value?.ed2k) return amuleOk.value ? "unknown" : "disconnected";
  if (status.value.ed2k.connected) return "connected";
  if (status.value.ed2k.status === "connecting") return "connecting";
  return "disconnected";
});
const ed2kStateIcon = computed(() => stateIcon(ed2kState.value));
const ed2kStateLabel = computed(() => stateLabel(ed2kState.value));

const kadState = computed<ConnectionState>(() => {
  if (!status.value?.kad) return amuleOk.value ? "unknown" : "disconnected";
  if (status.value.kad.firewalled) return "firewalled";
  if (status.value.kad.connected) return "connected";
  if (status.value.kad.status === "connecting") return "connecting";
  return "disconnected";
});
const kadStateIcon = computed(() => stateIcon(kadState.value));
const kadStateLabel = computed(() => stateLabel(kadState.value));

const amuleStackVariant = computed(() => {
  if (!amuleOk.value) return "danger";
  if (ed2kState.value === "connected" && kadState.value === "connected") return "success";
  if (ed2kState.value === "connecting" || kadState.value === "firewalled") return "warning";
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
