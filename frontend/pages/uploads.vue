<template>
  <div id="page-uploads">
    <h1 class="title is-4 mb-4">{{ $t("uploads.title") }}</h1>

    <!-- Totals bar -->
    <div class="box py-3 mb-4">
      <div class="totals-bar">
        <div class="total-item" v-if="amuleCount > 0">
          <span class="mdi mdi-donkey icon-sm" />
          <strong>{{ amuleSpeedFmt }}</strong>
          <span class="has-text-grey is-size-7 ml-1"
            >({{ amuleCount }} {{ $t("uploads.peers") }})</span
          >
        </div>
        <div class="total-item" v-if="transmissionCount > 0">
          <span class="mdi mdi-magnet" />
          <strong>{{ transmissionSpeedFmt }}</strong>
          <span class="has-text-grey is-size-7 ml-1"
            >({{ transmissionCount }} {{ $t("uploads.peers") }})</span
          >
        </div>
        <div class="total-item" v-if="slskdCount > 0">
          <span class="mdi mdi-bird" />
          <strong>{{ slskdSpeedFmt }}</strong>
          <span class="has-text-grey is-size-7 ml-1"
            >({{ slskdCount }} {{ $t("uploads.peers") }})</span
          >
        </div>
        <div class="total-item">
          <span class="mdi mdi-arrow-up-bold" />
          {{ clients.length }} {{ $t("uploads.peers") }} &mdash;
          <strong>{{ totalSpeedFmt }}</strong>
        </div>
      </div>
      <SpeedGraph ref="speedGraphRef" :history="speedHistory" />
    </div>

    <!-- Filters -->
    <div class="columns is-mobile mb-2" v-if="clients.length > 0">
      <div class="column is-narrow">
        <SFormItem :label="$t('uploads.filter.source')">
          <SSelect v-model="filterSource" :options="sourceOptions" size="sm" />
        </SFormItem>
      </div>
    </div>

    <STable :data="filteredClients" :columns="columns" :loading="loading">
      <template #cell-type="{ row }">
        <STag
          v-if="row._type === 'amule'"
          variant="warning"
          size="sm"
          :title="$t('uploads.tooltip.amule')"
        >
          <span class="mdi mdi-donkey" />
        </STag>
        <STag
          v-else-if="row._type === 'slskd'"
          variant="primary"
          size="sm"
          title="Soulseek"
        >
          <span class="mdi mdi-bird" />
        </STag>
        <STag v-else variant="info" size="sm" :title="$t('uploads.tooltip.torrent')">
          <span class="mdi mdi-magnet" />
        </STag>
      </template>
      <template #cell-client="{ row }">
        <span class="has-text-weight-medium">{{ row.clientName }}</span>
        <span class="has-text-grey is-size-7 ml-1" v-if="row._type === 'amule' && row.software">
          ({{ row.software }}{{ row.softwareVersion ? " " + row.softwareVersion : "" }})
        </span>
        <STag v-if="row._type === 'slskd' && row.state" size="sm" variant="default" class="ml-1">{{ row.state }}</STag>
      </template>
      <template #cell-file="{ row }">
        <span v-if="row.fileName" class="is-size-7">{{ row.fileName }}</span>
        <span v-else class="has-text-grey is-size-7">&mdash;</span>
      </template>
      <template #cell-speed="{ row }">{{ row.uploadSpeed_fmt }}</template>
      <template #cell-uploaded="{ row }">
        <template v-if="row._type === 'amule'">
          {{ row.uploadSession_fmt || "&mdash;" }}
        </template>
        <template v-else-if="row._type === 'slskd'">
          {{ row.uploadSession_fmt || "&mdash;" }} / {{ row.uploadTotal_fmt || "&mdash;" }}
        </template>
        <template v-else>&mdash;</template>
      </template>
      <template #cell-progress="{ row }">
        <template v-if="row._type === 'transmission' && row.peerProgress != null">
          {{ (row.peerProgress * 100).toFixed(1) }}%
        </template>
        <template v-else-if="row._type === 'slskd' && row.peerProgress != null">
          {{ (row.peerProgress * 100).toFixed(1) }}%
        </template>
        <template v-else>&mdash;</template>
      </template>
      <template #cell-ip="{ row }">
        <span v-if="row._type === 'slskd'" class="has-text-grey is-size-7">&mdash;</span>
        <span v-else class="is-size-7">{{ row.ip }}{{ row.port ? ":" + row.port : "" }}</span>
        <span
          v-if="row.isEncrypted"
          class="mdi mdi-lock has-text-success ml-1"
          :title="$t('uploads.encrypted')"
        />
      </template>
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          <span class="mdi mdi-upload-off icon-lg" />
          <p>{{ $t("uploads.noClients") }}</p>
        </div>
      </template>
    </STable>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { amuleRunning, slskdRunning } = useServiceGuard();
const { t } = useI18n();

const clients = ref<any[]>([]);
const loading = ref(false);
const speedGraphRef = ref<{ draw: () => void } | null>(null);
const speedHistory = ref<
  { t: number; amule: number; torrent: number; pyload: number; slskd: number; up: number }[]
>([]);
let refreshInterval: ReturnType<typeof setInterval> | null = null;

const filterSource = ref("all");

const sourceOptions = computed(() => [
  { value: "all", label: t("uploads.filter.all") },
  { value: "amule", label: "aMule" },
  { value: "transmission", label: "Transmission" },
  { value: "slskd", label: "Soulseek" },
]);

const filteredClients = computed(() => {
  if (filterSource.value === "all") return clients.value;
  return clients.value.filter((c) => c._type === filterSource.value);
});

const amuleCount = computed(() => clients.value.filter((c) => c._type === "amule").length);
const transmissionCount = computed(
  () => clients.value.filter((c) => c._type === "transmission").length,
);
const slskdCount = computed(() => clients.value.filter((c) => c._type === "slskd").length);

const columns = computed(() => [
  { key: "type", label: "", width: 42 },
  { key: "client", label: t("uploads.columns.client"), sortable: true },
  { key: "file", label: t("uploads.columns.file") },
  {
    key: "speed",
    label: t("uploads.columns.speed"),
    width: 100,
    sortable: true,
  },
  { key: "uploaded", label: t("uploads.columns.uploaded"), width: 100 },
  {
    key: "progress",
    label: t("uploads.columns.progress"),
    width: 90,
    align: "right" as const,
  },
  { key: "ip", label: t("uploads.columns.ip"), width: 160 },
]);

const totalSpeedFmt = computed(() =>
  formatSpeed(clients.value.reduce((s, c) => s + (c.uploadSpeed || 0), 0)),
);
const amuleSpeedFmt = computed(() =>
  formatSpeed(
    clients.value.filter((c) => c._type === "amule").reduce((s, c) => s + (c.uploadSpeed || 0), 0),
  ),
);
const transmissionSpeedFmt = computed(() =>
  formatSpeed(
    clients.value
      .filter((c) => c._type === "transmission")
      .reduce((s, c) => s + (c.uploadSpeed || 0), 0),
  ),
);
const slskdSpeedFmt = computed(() =>
  formatSpeed(
    clients.value
      .filter((c) => c._type === "slskd")
      .reduce((s, c) => s + (c.uploadSpeed || 0), 0),
  ),
);

async function fetchSpeedHistory() {
  try {
    const data =
      await apiFetch<{ t: number; amule: number; torrent: number; pyload: number; slskd: number; up: number }[]>(
        "/api/speed-history",
      );
    speedHistory.value = data ?? [];
  } catch {
    /* silent */
  }
  nextTick(() => speedGraphRef.value?.draw());
}

async function refresh() {
  await Promise.all([
    amuleRunning.value
      ? apiFetch<any>("/api/amule/uploads")
          .then((res) => {
            const amuleClients = res?.uploads?.clients || [];
            // Merge with existing slskd clients, preserve slskd entries
            const slskdEntries = clients.value.filter((c: any) => c._type === "slskd");
            clients.value = [...amuleClients, ...slskdEntries];
          })
          .catch(() => {})
      : Promise.resolve(),
    slskdRunning.value
      ? apiFetch<any[]>("/api/slskd/transfers?direction=upload")
          .then((transfers) => {
            const amuleEntries = clients.value.filter((c: any) => c._type !== "slskd");
            const slskdEntries = (transfers || []).map((t: any) => ({
              _type: "slskd" as const,
              clientName: t.username || "Unknown",
              userHash: "",
              software: "",
              softwareVersion: "",
              fileName: t.filename || "",
              score: 0,
              uploadSpeed: t.averageSpeed || 0,
              uploadSpeed_fmt: formatSpeed(t.averageSpeed || 0),
              uploadSession: t.bytesTransferred || 0,
              uploadSession_fmt: formatBytes(t.bytesTransferred || 0),
              uploadTotal: t.size || 0,
              state: t.state || "",
              uploadTotal_fmt: formatBytes(t.size || 0),
              ip: "",
              port: 0,
              peerProgress: t.size > 0 ? (t.bytesTransferred || 0) / t.size : 0,
            }));
            clients.value = [...amuleEntries, ...slskdEntries];
          })
          .catch(() => {})
      : Promise.resolve(),
    fetchSpeedHistory(),
  ]);
}

onMounted(() => {
  loading.value = true;
  refresh().finally(() => (loading.value = false));
  refreshInterval = setInterval(refresh, 5000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>
