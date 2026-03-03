<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-chart-bar mr-1" />
      {{ $t("transmission.stats.title") }}
    </h1>

    <!-- Session info -->
    <div class="box mb-4">
      <h6 class="title is-6 mb-3">
        <span class="mdi mdi-information mr-1" />
        {{ $t("transmission.stats.sessionInfo") }}
      </h6>
      <div class="stat-grid">
        <div class="stat-item">
          <span class="stat-label">{{ $t("transmission.stats.version") }}</span
          ><span class="stat-value">{{ session.version }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{
            $t("transmission.stats.rpcVersion")
          }}</span
          ><span class="stat-value">{{ session.rpcVersion }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{
            $t("transmission.stats.downloadDir")
          }}</span
          ><span class="stat-value is-size-7">{{ session.downloadDir }}</span>
        </div>
      </div>
    </div>

    <div class="columns">
      <!-- Current session -->
      <div class="column is-6">
        <div class="box">
          <h6 class="title is-6 mb-3">
            <span class="mdi mdi-clock-outline mr-1" />
            {{ $t("transmission.stats.currentSession") }}
          </h6>
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.activeTorrents")
              }}</span
              ><span class="stat-value">{{ live.activeTorrentCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.pausedTorrents")
              }}</span
              ><span class="stat-value">{{ live.pausedTorrentCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.totalTorrents")
              }}</span
              ><span class="stat-value">{{ live.torrentCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.downloadSpeed")
              }}</span
              ><span class="stat-value has-text-success">{{
                live.downloadSpeed_fmt
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.uploadSpeed")
              }}</span
              ><span class="stat-value has-text-info">{{
                live.uploadSpeed_fmt
              }}</span>
            </div>
          </div>
          <SDivider />
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.downloaded")
              }}</span
              ><span class="stat-value">{{
                formatSize(currentStats.downloadedBytes)
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.uploaded")
              }}</span
              ><span class="stat-value">{{
                formatSize(currentStats.uploadedBytes)
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.filesAdded")
              }}</span
              ><span class="stat-value">{{ currentStats.filesAdded }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.activeTime")
              }}</span
              ><span class="stat-value">{{
                formatDuration(currentStats.secondsActive)
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cumulative -->
      <div class="column is-6">
        <div class="box">
          <h6 class="title is-6 mb-3">
            <span class="mdi mdi-chart-timeline-variant mr-1" />
            {{ $t("transmission.stats.allTime") }}
          </h6>
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.downloaded")
              }}</span
              ><span class="stat-value">{{
                formatSize(cumulativeStats.downloadedBytes)
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.uploaded")
              }}</span
              ><span class="stat-value">{{
                formatSize(cumulativeStats.uploadedBytes)
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.filesAdded")
              }}</span
              ><span class="stat-value">{{ cumulativeStats.filesAdded }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.activeTime")
              }}</span
              ><span class="stat-value">{{
                formatDuration(cumulativeStats.secondsActive)
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.sessionsStarted")
              }}</span
              ><span class="stat-value">{{
                cumulativeStats.sessionCount
              }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{
                $t("transmission.stats.ratioAllTime")
              }}</span
              ><span class="stat-value">{{ allTimeRatio }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const loading = ref(true);

const session = reactive({ version: "", rpcVersion: "", downloadDir: "" });
const live = reactive({
  activeTorrentCount: 0,
  pausedTorrentCount: 0,
  torrentCount: 0,
  downloadSpeed: 0,
  downloadSpeed_fmt: "0 B/s",
  uploadSpeed: 0,
  uploadSpeed_fmt: "0 B/s",
});
const currentStats = reactive({
  downloadedBytes: 0,
  uploadedBytes: 0,
  filesAdded: 0,
  secondsActive: 0,
  sessionCount: 0,
});
const cumulativeStats = reactive({
  downloadedBytes: 0,
  uploadedBytes: 0,
  filesAdded: 0,
  secondsActive: 0,
  sessionCount: 0,
});

const allTimeRatio = computed(() => {
  if (cumulativeStats.downloadedBytes === 0) return "\u2014";
  return (
    cumulativeStats.uploadedBytes / cumulativeStats.downloadedBytes
  ).toFixed(3);
});

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatDuration(seconds: number) {
  if (!seconds) return "\u2014";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) parts.push("<1m");
  return parts.join(" ");
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

async function fetchStats() {
  if (!transmissionRunning.value) return;
  try {
    const { raw, stats } = await apiFetch<any>("/api/transmission/session");
    session.version = raw.version || "";
    session.rpcVersion = raw["rpc-version"] || "";
    session.downloadDir = raw["download-dir"] || "";
    if (stats) {
      live.activeTorrentCount = stats.activeTorrentCount || 0;
      live.pausedTorrentCount = stats.pausedTorrentCount || 0;
      live.torrentCount = stats.torrentCount || 0;
      live.downloadSpeed_fmt = stats.downloadSpeed_fmt || "0 B/s";
      live.uploadSpeed_fmt = stats.uploadSpeed_fmt || "0 B/s";
      if (stats.currentStats) Object.assign(currentStats, stats.currentStats);
      if (stats.cumulativeStats)
        Object.assign(cumulativeStats, stats.cumulativeStats);
    }
    loading.value = false;
  } catch {
    /* useApi shows error toast */
  }
}

onMounted(() => {
  fetchStats();
  refreshInterval = setInterval(fetchStats, 5000);
});
onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
.stat-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.2rem 0;
}
.stat-label {
  color: var(--s-text-muted);
  font-size: 0.85rem;
}
.stat-value {
  font-weight: 500;
  font-size: 0.9rem;
}
</style>
