<template>
  <SLoading id="page-amule-stats" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("stats.title") }}</h1>

    <div class="columns is-multiline" v-if="stats">
      <div class="column is-6">
        <div class="box">
          <h2 class="subtitle is-5 mb-3">{{ $t("stats.connection") }}</h2>
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.server") }}</span>
              <span class="kv-value">{{ stats.serv_name || "—" }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.address") }}</span>
              <span class="kv-value">{{ stats.serv_addr || "—" }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.ed2kId") }}</span>
              <span class="kv-value">{{
                stats.ed2kId || stats.id || "—"
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.kad") }}</span>
              <span class="kv-value">{{
                connStatus?.kad?.connected
                  ? $t("stats.connected")
                  : $t("stats.disconnected")
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="column is-6">
        <div class="box">
          <h2 class="subtitle is-5 mb-3">{{ $t("stats.transfer") }}</h2>
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.downloadSpeed") }}</span>
              <span class="kv-value">{{
                stats.downloadSpeed_fmt || "0 B/s"
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.uploadSpeed") }}</span>
              <span class="kv-value">{{
                stats.uploadSpeed_fmt || "0 B/s"
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.totalDownloaded") }}</span>
              <span class="kv-value">{{
                stats.totalReceivedBytes_fmt || "0 B"
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.totalUploaded") }}</span>
              <span class="kv-value">{{
                stats.totalSentBytes_fmt || "0 B"
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="column is-6">
        <div class="box">
          <h2 class="subtitle is-5 mb-3">{{ $t("stats.network") }}</h2>
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.ed2kUsers") }}</span>
              <span class="kv-value">{{
                (stats.ed2kUsers || 0).toLocaleString()
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.ed2kFiles") }}</span>
              <span class="kv-value">{{
                (stats.ed2kFiles || 0).toLocaleString()
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.kadUsers") }}</span>
              <span class="kv-value">{{
                (stats.kadUsers || 0).toLocaleString()
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.kadFiles") }}</span>
              <span class="kv-value">{{
                (stats.kadFiles || 0).toLocaleString()
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.kadNodes") }}</span>
              <span class="kv-value">{{
                (stats.kadNodes || 0).toLocaleString()
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="column is-6">
        <div class="box">
          <h2 class="subtitle is-5 mb-3">{{ $t("stats.queue") }}</h2>
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.uploadQueue") }}</span>
              <span class="kv-value">{{ stats.uploadQueueLength || 0 }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.totalSources") }}</span>
              <span class="kv-value">{{ stats.totalSourceCount || 0 }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.sharedFiles") }}</span>
              <span class="kv-value">{{ stats.sharedFileCount || 0 }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">{{ $t("stats.bannedClients") }}</span>
              <span class="kv-value">{{ stats.bannedCount || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="box" v-if="statsTree && statsTree.length > 0">
      <h2 class="subtitle is-5 mb-3">{{ $t("stats.statsTree") }}</h2>
      <StatsTree :nodes="statsTree" />
    </div>

    <div v-if="!stats && !loading" class="has-text-centered py-5 has-text-grey">
      {{ $t("stats.noStats") }}
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { amuleRunning } = useServiceGuard();

const stats = ref<any>(null);
const connStatus = ref<any>(null);
const statsTree = ref<any[]>([]);
const loading = ref(false);

async function refresh() {
  if (!amuleRunning.value) return;
  loading.value = true;
  try {
    const [statsRes, treeRes] = await Promise.all([
      apiFetch<any>("/api/amule/stats"),
      apiFetch<any>("/api/amule/raw/stats-tree").catch(() => null),
    ]);
    stats.value = statsRes?.stats || null;
    connStatus.value = statsRes?.connection_status || null;
    statsTree.value = treeRes?.tree || [];
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
