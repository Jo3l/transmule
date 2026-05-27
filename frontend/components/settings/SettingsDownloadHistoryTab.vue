<template>
  <div class="box">
    <div class="dh-header">
      <div>
        <h6 class="title is-6 mb-1 mt-3">{{ $t("settings.downloadHistoryTitle") }}</h6>
        <p class="has-text-grey is-size-7 mb-3">
          {{ $t("settings.downloadHistoryDescription") }}
        </p>
      </div>
    </div>

    <SLoading v-if="historyLoading" />

    <p v-else-if="!historyEntries.length" class="has-text-muted is-size-7">
      {{ $t("settings.downloadHistoryEmpty") }}
    </p>

    <template v-else>
      <STable :data="historyEntries" :columns="historyCols" stripe>
        <template #cell-title="{ row }">
          <span class="dh-title" :title="row.url">{{ row.title || row.url }}</span>
        </template>
        <template #cell-service="{ row }">
          <STag size="sm" :variant="historyServiceVariant(row.service)">
            {{ historyServiceLabel(row.service) }}
          </STag>
        </template>
        <template #cell-date="{ row }">
          <span class="is-size-7 has-text-grey">{{ formatHistoryDate(row.sent_at) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="stt-actions">
            <SButton
              variant="primary"
              size="sm"
              :loading="historyRedownloading === row.id"
              :disabled="!!historyRedownloading"
              :title="$t('settings.downloadHistoryReDownload')"
              @click="reDownload(row)"
            >
              <span class="mdi mdi-download mr-1" />
              {{ $t("settings.downloadHistoryReDownload") }}
            </SButton>
            <SButton
              variant="danger"
              size="sm"
              :loading="historyRemoving === row.id"
              :disabled="!!historyRemoving"
              :title="$t('settings.downloadHistoryRemove')"
              @click="removeHistoryEntry(row)"
            >
              <span class="mdi mdi-delete mr-1" />
              {{ $t("settings.downloadHistoryRemove") }}
            </SButton>
          </div>
        </template>
      </STable>

      <!-- Pagination -->
      <div class="dh-pagination">
        <SButton
          size="sm"
          :disabled="historyPage <= 1"
          @click="gotoHistoryPage(historyPage - 1)"
        >
          <span class="mdi mdi-chevron-left mr-1" />{{ $t("settings.downloadHistoryPrev") }}
        </SButton>
        <span class="dh-page-info">
          {{ $t("settings.downloadHistoryPage", { page: historyPage, pages: historyPages }) }}
        </span>
        <SButton
          size="sm"
          :disabled="historyPage >= historyPages"
          @click="gotoHistoryPage(historyPage + 1)"
        >
          {{ $t("settings.downloadHistoryNext") }}<span class="mdi mdi-chevron-right ml-1" />
        </SButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { STableColumn } from "~/components/s/STable.vue";

const { t } = useI18n();
const { apiFetch } = useApi();
const { addToast } = useToast();

interface HistoryEntry {
  id: number;
  url: string;
  title: string | null;
  service: string;
  sent_at: string;
}

const historyEntries = ref<HistoryEntry[]>([]);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPages = ref(1);
const historyLoading = ref(false);
const historyRedownloading = ref<number | null>(null);
const historyRemoving = ref<number | null>(null);

const historyCols = computed<STableColumn[]>(() => [
  { key: "title", label: t("settings.downloadHistoryColumns.title") },
  { key: "service", label: t("settings.downloadHistoryColumns.service"), width: 110 },
  { key: "date", label: t("settings.downloadHistoryColumns.date"), width: 160 },
  { key: "actions", label: "" },
]);

const SERVICE_LABELS: Record<string, string> = {
  transmission: "Torrent",
  amule: "ED2K",
  pyload: "Direct",
  "dontorrent-movies": "Torrent",
  "dontorrent-shows": "Torrent",
  "transmission-search": "Torrent",
  yts: "Torrent",
  showrss: "Torrent",
};

function historyServiceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service;
}

function historyServiceVariant(service: string): "primary" | "success" | "warning" | "info" | "default" {
  const map: Record<string, "primary" | "success" | "warning" | "info"> = {
    transmission: "success",
    amule: "warning",
    pyload: "info",
    "dontorrent-movies": "success",
    "dontorrent-shows": "success",
    "transmission-search": "success",
    yts: "success",
    showrss: "success",
  };
  return map[service] ?? "default";
}

function formatHistoryDate(raw: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(raw));
  } catch {
    return raw;
  }
}

async function loadHistory(page = historyPage.value) {
  historyLoading.value = true;
  try {
    const res = await apiFetch<{
      entries: HistoryEntry[]; total: number; page: number; pages: number;
    }>(`/api/download-history-list?page=${page}`);
    historyEntries.value = res.entries;
    historyTotal.value = res.total;
    historyPage.value = res.page;
    historyPages.value = res.pages;
  } catch {
    /* silent */
  } finally {
    historyLoading.value = false;
  }
}

async function gotoHistoryPage(page: number) {
  await loadHistory(page);
}

async function reDownload(entry: HistoryEntry) {
  historyRedownloading.value = entry.id;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: entry.url },
    });
    addToast(t("settings.downloadHistorySent"), "success");
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    historyRedownloading.value = null;
  }
}

async function removeHistoryEntry(entry: HistoryEntry) {
  historyRemoving.value = entry.id;
  try {
    await apiFetch("/api/download-history-list", {
      method: "DELETE",
      body: { id: entry.id },
    });
    historyEntries.value = historyEntries.value.filter((e) => e.id !== entry.id);
    historyTotal.value = Math.max(0, historyTotal.value - 1);
    addToast(t("settings.downloadHistoryRemoved"), "success");
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    historyRemoving.value = null;
  }
}

onMounted(() => {
  loadHistory();
});
</script>

<style scoped>
.dh-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.dh-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 360px;
  display: inline-block;
  vertical-align: bottom;
}
.dh-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.dh-page-info {
  font-size: 0.8rem;
  color: var(--s-text-muted);
}
.stt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
</style>
