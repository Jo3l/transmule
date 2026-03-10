<template>
  <div v-if="jobs.length > 0" ref="wrapRef" class="transfer-systray-wrap" @click.stop>
    <!-- Pill trigger -->
    <button
      class="transfer-systray"
      :class="{ 'is-active': hasActive, 'is-open': open }"
      @click="open = !open"
    >
      <span class="mdi mdi-transfer transfer-systray__icon" :class="{ 'is-spinning': hasActive }" />
      <div v-if="hasActive" class="transfer-systray__bars">
        <div v-for="job in visibleActiveJobs" :key="job.queueId" class="transfer-systray__bar-wrap">
          <div class="transfer-systray__bar" :style="{ width: job.percent + '%' }" />
        </div>
      </div>
      <span class="transfer-systray__label">
        <template v-if="hasActive">
          {{ activeJobs.length > 1 ? `${activeJobs.length}×` : `${overallPercent}%` }}
        </template>
        <span v-else class="mdi mdi-check-all" />
      </span>
      <span
        class="mdi transfer-systray__chevron"
        :class="open ? 'mdi-chevron-up' : 'mdi-chevron-down'"
      />
    </button>

    <!-- Dropdown panel -->
    <div v-if="open" class="transfer-dropdown">
      <div class="transfer-dropdown__header">
        <span>{{ $t("fileManager.transfers") }}</span>
        <button class="transfer-dropdown__clear-btn" @click="clearDone">
          {{ $t("fileManager.clearDone") }}
        </button>
      </div>
      <div class="transfer-dropdown__list">
        <div
          v-for="job in [...jobs].reverse()"
          :key="job.queueId"
          class="transfer-dropdown__row"
          :class="`is-${job.status}`"
        >
          <span class="mdi transfer-dropdown__icon" :class="rowIcon(job)" />
          <div class="transfer-dropdown__body">
            <div class="transfer-dropdown__name" :title="job.source">{{ job.name }}</div>
            <div class="transfer-dropdown__sub">
              <span class="transfer-dropdown__mode">{{ rowModeSymbol(job) }}</span>
              {{ rowLabel(job) }}
            </div>
            <div v-if="job.status === 'running'" class="transfer-dropdown__progress">
              <div class="transfer-dropdown__progress-bar" :style="{ width: job.percent + '%' }" />
            </div>
          </div>
          <span v-if="job.status === 'running'" class="transfer-dropdown__pct">
            {{ job.percent }}%
            <span v-if="job.speed && job.speed > 512" class="transfer-dropdown__speed">
              {{ fmtSpeed(job.speed) }}
            </span>
          </span>
          <span v-else-if="job.status === 'queued'" class="transfer-dropdown__badge">
            {{ $t("fileManager.queued") }}
          </span>
          <button
            v-if="job.status === 'queued' || job.status === 'running'"
            class="transfer-dropdown__cancel"
            :title="$t('fileManager.cancel')"
            @click.stop="cancelJob(job)"
          >
            <span class="mdi mdi-close" />
          </button>
        </div>
        <div v-if="!jobs.length" class="transfer-dropdown__empty">
          {{ $t("fileManager.noTransfers") }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TransferJob } from "~/composables/useTransferJobs";

const { jobs, activeJobs, hasActive, clearDone, cancelJob } = useTransferJobs();
const { t } = useI18n();

const open = ref(false);
const wrapRef = ref<HTMLElement | null>(null);

const overallPercent = computed(() => {
  if (!activeJobs.value.length) return 0;
  const sum = activeJobs.value.reduce((a, j) => a + j.percent, 0);
  return Math.round(sum / activeJobs.value.length);
});

// Limit pill to 3 progress bars; dropdown still shows all.
const visibleActiveJobs = computed(() => activeJobs.value.slice(0, 3));

function rowModeSymbol(job: TransferJob) {
  if (job.mode === "move") return "→";
  if (job.mode === "extract") return "↓";
  if (job.mode === "compress") return "↑";
  if (job.mode === "upload") return "↑";
  return "⊕"; // copy
}

function rowIcon(job: TransferJob) {
  if (job.status === "done") return "mdi-check-circle";
  if (job.status === "error") return "mdi-alert-circle";
  if (job.status === "queued") return "mdi-clock-outline";
  if (job.mode === "extract") return "mdi-archive-arrow-down-outline";
  if (job.mode === "compress") return "mdi-archive-arrow-up-outline";
  if (job.mode === "upload") return "mdi-upload";
  return "mdi-transfer";
}

function rowLabel(job: TransferJob) {
  if (job.status === "done") {
    if (job.mode === "extract") return t("fileManager.extractDone");
    if (job.mode === "compress") return t("fileManager.compressDone");
    return t("fileManager.transferDone", { mode: t(`fileManager.${job.mode}`) });
  }
  if (job.status === "error") return job.error ?? t("fileManager.transferError", { error: "" });
  if (job.status === "queued") return "…";
  // running — show byte progress if available, fall back to percent
  if ((job.bytesTotal ?? 0) > 0) {
    return `${fmtBytes(job.bytesDone ?? 0)} / ${fmtBytes(job.bytesTotal!)}`;
  }
  return `${job.percent}%`;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fmtSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.round(bps / 1024)} KB/s`;
}

// Close when clicking outside the widget
function onMousedown(e: MouseEvent) {
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}
onMounted(() => window.addEventListener("mousedown", onMousedown));
onBeforeUnmount(() => window.removeEventListener("mousedown", onMousedown));
</script>

<style scoped>
.transfer-systray-wrap {
  position: relative;
}

/* ── Pill ─────────────────────────────────────────────────────────────── */
.transfer-systray {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  background: var(--s-bg-surface);
  font-size: 0.75rem;
  color: var(--s-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  min-width: 80px;
  transition: border-color 0.15s;
}
.transfer-systray:hover,
.transfer-systray.is-open {
  border-color: var(--s-accent);
}

.transfer-systray__icon {
  color: var(--s-accent);
  font-size: 1rem;
}
.transfer-systray__icon.is-spinning {
  animation: transfer-spin 1.5s linear infinite;
}

@keyframes transfer-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.transfer-systray__bars {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 40px;
}
.transfer-systray__bar-wrap {
  height: 4px;
  border-radius: 2px;
  background: var(--s-border);
  overflow: hidden;
}
.transfer-systray__bar {
  height: 100%;
  border-radius: 2px;
  background: var(--s-accent);
  transition: width 0.4s ease;
}
.transfer-systray__label {
  color: var(--s-accent);
  font-weight: 600;
}
.transfer-systray__chevron {
  font-size: 0.8rem;
  color: var(--s-text-secondary);
}

/* ── Dropdown ─────────────────────────────────────────────────────────── */
.transfer-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 320px;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 9999;
  overflow: hidden;
}

.transfer-dropdown__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--s-text-secondary);
  border-bottom: 1px solid var(--s-border);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.transfer-dropdown__clear-btn {
  background: none;
  border: none;
  color: var(--s-accent);
  font-size: 0.7rem;
  cursor: pointer;
  padding: 0;
}
.transfer-dropdown__clear-btn:hover {
  text-decoration: underline;
}

.transfer-dropdown__list {
  max-height: 320px;
  overflow-y: auto;
}

.transfer-dropdown__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--s-border) 50%, transparent);
}
.transfer-dropdown__row:last-child {
  border-bottom: none;
}

.transfer-dropdown__icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}
.transfer-dropdown__row.is-done .transfer-dropdown__icon {
  color: var(--s-success, #22c55e);
}
.transfer-dropdown__row.is-error .transfer-dropdown__icon {
  color: var(--s-danger, #ef4444);
}
.transfer-dropdown__row.is-queued .transfer-dropdown__icon {
  color: var(--s-text-secondary);
}
.transfer-dropdown__row.is-running .transfer-dropdown__icon {
  color: var(--s-accent);
  animation: transfer-spin 1.5s linear infinite;
}

.transfer-dropdown__body {
  flex: 1;
  min-width: 0;
}
.transfer-dropdown__name {
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--s-text);
}
.transfer-dropdown__sub {
  font-size: 0.7rem;
  color: var(--s-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.transfer-dropdown__mode {
  margin-right: 0.25rem;
  color: var(--s-accent);
  font-weight: 600;
}

.transfer-dropdown__progress {
  margin-top: 3px;
  height: 3px;
  background: var(--s-border);
  border-radius: 2px;
  overflow: hidden;
}
.transfer-dropdown__progress-bar {
  height: 100%;
  background: var(--s-accent);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.transfer-dropdown__pct {
  font-size: 0.7rem;
  color: var(--s-accent);
  font-weight: 600;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.transfer-dropdown__speed {
  font-size: 0.6rem;
  font-weight: 400;
  color: var(--s-text-secondary);
  white-space: nowrap;
}
.transfer-dropdown__badge {
  font-size: 0.65rem;
  color: var(--s-text-secondary);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  padding: 0 0.3rem;
  flex-shrink: 0;
}

.transfer-dropdown__cancel {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0 0.1rem;
  cursor: pointer;
  color: var(--s-text-secondary);
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.6;
  transition:
    opacity 0.15s,
    color 0.15s;
}
.transfer-dropdown__cancel:hover {
  opacity: 1;
  color: var(--s-danger, #ef4444);
}

.transfer-dropdown__cancel {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0 0.1rem;
  cursor: pointer;
  color: var(--s-text-secondary);
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.6;
  transition:
    opacity 0.15s,
    color 0.15s;
}
.transfer-dropdown__cancel:hover {
  opacity: 1;
  color: var(--s-danger, #ef4444);
}

.transfer-dropdown__empty {
  padding: 1rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--s-text-secondary);
}
</style>
