<template>
  <SLoading id="page-pyload-logs" :loading="initialLoading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-text-box-outline mr-1" />
      {{ $t("pyloadLogs.title") }}
    </h1>

    <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

    <div class="box mb-4">
      <div class="columns is-multiline">
        <div class="column is-5">
          <SFormItem :label="$t('pyloadLogs.search')">
            <SInput v-model="searchText" :placeholder="$t('pyloadLogs.searchPlaceholder')" />
          </SFormItem>
        </div>
        <div class="column is-3">
          <SFormItem :label="$t('pyloadLogs.level')">
            <SSelect v-model="selectedLevel" :options="levelOptions" class="mw-200" />
          </SFormItem>
        </div>
        <div class="column is-2">
          <SFormItem :label="$t('pyloadLogs.limit')">
            <SInputNumber v-model="lineLimit" :min="10" :step="50" />
          </SFormItem>
        </div>
        <div class="column is-2">
          <SFormItem :label="$t('pyloadLogs.interval')">
            <SSelect v-model="refreshMs" :options="intervalOptions" class="mw-200" />
          </SFormItem>
        </div>
      </div>

      <div class="flex-end">
        <SCheckbox v-model="autoRefresh">{{ $t("pyloadLogs.autoRefresh") }}</SCheckbox>
      </div>
    </div>

    <div class="box">
      <div class="flex-row gap-sm align-center mb-3">
        <span class="has-text-grey is-size-7">
          {{ $t("pyloadLogs.source") }}: <strong>{{ sourceLabel }}</strong>
        </span>
        <span class="has-text-grey is-size-7">
          {{ $t("pyloadLogs.updated") }}: <strong>{{ lastUpdated || "-" }}</strong>
        </span>
      </div>

      <div v-if="filteredItems.length === 0" class="has-text-grey is-size-7">
        {{ $t("pyloadLogs.empty") }}
      </div>

      <div v-else class="log-content">
        <div
          v-for="entry in filteredItems"
          :key="entry.id"
          class="log-line"
          :class="`is-${entry.level}`"
        >
          <span class="log-ts">{{ entry.timestamp }}</span>
          <span class="log-level">{{ entry.level.toUpperCase() }}</span>
          <span class="log-msg">{{ entry.message }}</span>
        </div>
      </div>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();

type LogLevel = "debug" | "info" | "warning" | "error" | "critical" | "other";

interface PyLoadLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

const initialLoading = ref(true);
const refreshing = ref(false);
const errorMsg = ref("");
const source = ref("");
const lastUpdated = ref("");
const items = ref<PyLoadLogEntry[]>([]);
const searchText = ref("");
const selectedLevel = ref("all");
const lineLimit = ref(400);
const autoRefresh = ref(true);
const refreshMs = ref("5000");
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const levelOptions = computed(() => [
  { label: t("pyloadLogs.levelAll"), value: "all" },
  { label: "DEBUG", value: "debug" },
  { label: "INFO", value: "info" },
  { label: "WARNING", value: "warning" },
  { label: "ERROR", value: "error" },
  { label: "CRITICAL", value: "critical" },
  { label: t("pyloadLogs.levelOther"), value: "other" },
]);

const intervalOptions = computed(() => [
  { label: `5s`, value: "5000" },
  { label: `10s`, value: "10000" },
  { label: `15s`, value: "15000" },
  { label: `30s`, value: "30000" },
  { label: `60s`, value: "60000" },
]);

const sourceLabel = computed(() => {
  if (!source.value) return "-";
  if (source.value.startsWith("docker:")) return t("pyloadLogs.sourceDocker");
  if (source.value === "unavailable") return t("pyloadLogs.sourceUnavailable");
  return t("pyloadLogs.sourceApi", { command: source.value });
});

const filteredItems = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  return items.value.filter((entry) => {
    if (selectedLevel.value !== "all" && entry.level !== selectedLevel.value) {
      return false;
    }

    if (!query) return true;

    return (
      entry.message.toLowerCase().includes(query) ||
      entry.timestamp.toLowerCase().includes(query) ||
      entry.level.toLowerCase().includes(query)
    );
  });
});

function stopTimer() {
  if (!refreshTimer) return;
  clearInterval(refreshTimer);
  refreshTimer = null;
}

function startTimer() {
  stopTimer();
  if (!autoRefresh.value) return;

  const interval = Number.parseInt(refreshMs.value, 10);
  if (!Number.isFinite(interval) || interval < 1000) return;

  refreshTimer = setInterval(() => {
    refresh(true);
  }, interval);
}

async function refresh(silent = false) {
  if (!silent) {
    refreshing.value = true;
    errorMsg.value = "";
  }

  try {
    const response = await apiFetch<{
      source?: string;
      items?: PyLoadLogEntry[];
      fetchedAt?: string;
      warning?: string;
    }>("/api/pyload/logs", {
      query: {
        limit: String(Math.max(10, lineLimit.value || 400)),
      },
    });

    items.value = Array.isArray(response?.items) ? response.items : [];
    source.value = String(response?.source || "");
    if (!silent) {
      const hasLogs = items.value.length > 0;
      const usingDockerFallback = source.value.startsWith("docker:");
      const warningText = String(response?.warning || "");
      const apiUnavailableWarning = warningText
        .toLowerCase()
        .includes("pyload api log endpoint unavailable");
      errorMsg.value =
        warningText && !(hasLogs && usingDockerFallback)
          ? apiUnavailableWarning
            ? t("pyloadLogs.apiUnavailable")
            : warningText
          : "";
    }
    lastUpdated.value = response?.fetchedAt
      ? new Date(response.fetchedAt).toLocaleTimeString()
      : new Date().toLocaleTimeString();
  } catch (err: any) {
    if (!silent) {
      errorMsg.value = err?.data?.statusMessage || err?.statusMessage || t("pyloadLogs.loadError");
    }
  } finally {
    refreshing.value = false;
    initialLoading.value = false;
  }
}

watch([autoRefresh, refreshMs], () => {
  startTimer();
});

watch(lineLimit, () => {
  refresh();
});

onMounted(async () => {
  await refresh();
  startTimer();
});

onBeforeUnmount(() => {
  stopTimer();
});
</script>

<style scoped>
.log-content {
  background: var(--s-bg-surface-alt);
  border-radius: var(--s-radius);
  padding: 0.85rem;
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--s-border);
  font-family: "Fira Code", "Cascadia Code", monospace;
  font-size: 0.78rem;
  line-height: 1.45;
}

.log-line {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.15rem 0;
  color: var(--s-text);
}

.log-line.is-debug {
  color: var(--s-text-muted);
}

.log-line.is-info {
  color: var(--s-info);
}

.log-line.is-warning {
  color: var(--s-warning);
}

.log-line.is-error,
.log-line.is-critical {
  color: var(--s-danger);
}

.log-ts {
  color: var(--s-text-muted);
  white-space: nowrap;
}

.log-level {
  min-width: 70px;
  font-weight: 600;
}

.log-msg {
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .log-line {
    grid-template-columns: 1fr;
    gap: 0.2rem;
  }

  .log-level {
    min-width: 0;
  }
}
</style>
