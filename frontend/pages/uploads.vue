<template>
  <div id="page-uploads">
    <h1 class="title is-4 mb-4">{{ $t("uploads.title") }}</h1>

    <!-- Totals bar -->
    <div class="box py-3 mb-4" v-if="clients.length > 0">
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
        <div class="total-item">
          <span class="mdi mdi-arrow-up-bold" />
          {{ clients.length }} {{ $t("uploads.peers") }} &mdash;
          <strong>{{ totalSpeedFmt }}</strong>
        </div>
      </div>
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
        <STag v-else variant="info" size="sm" :title="$t('uploads.tooltip.torrent')">
          <span class="mdi mdi-magnet" />
        </STag>
      </template>
      <template #cell-client="{ row }">
        <span class="has-text-weight-medium">{{ row.clientName }}</span>
        <span class="has-text-grey is-size-7 ml-1" v-if="row._type === 'amule' && row.software">
          ({{ row.software }}{{ row.softwareVersion ? " " + row.softwareVersion : "" }})
        </span>
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
        <template v-else>&mdash;</template>
      </template>
      <template #cell-progress="{ row }">
        <template v-if="row._type === 'transmission' && row.peerProgress != null">
          {{ (row.peerProgress * 100).toFixed(1) }}%
        </template>
        <template v-else>&mdash;</template>
      </template>
      <template #cell-ip="{ row }">
        <span class="is-size-7">{{ row.ip }}{{ row.port ? ":" + row.port : "" }}</span>
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
const { amuleRunning } = useServiceGuard();
const { t } = useI18n();
const clients = ref<any[]>([]);
const loading = ref(false);
let refreshInterval: ReturnType<typeof setInterval> | null = null;

const filterSource = ref("all");

const sourceOptions = computed(() => [
  { value: "all", label: t("uploads.filter.all") },
  { value: "amule", label: "aMule" },
  { value: "transmission", label: "Transmission" },
]);

const filteredClients = computed(() => {
  if (filterSource.value === "all") return clients.value;
  return clients.value.filter((c) => c._type === filterSource.value);
});

const amuleCount = computed(() => clients.value.filter((c) => c._type === "amule").length);
const transmissionCount = computed(
  () => clients.value.filter((c) => c._type === "transmission").length,
);

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

async function refresh() {
  if (!amuleRunning.value) return;
  try {
    const res = await apiFetch<any>("/api/amule/uploads");
    clients.value = res?.uploads?.clients || [];
  } catch {
    /* handled */
  }
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
