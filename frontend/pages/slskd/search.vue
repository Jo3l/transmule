<template>
  <div id="page-slskd">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-account-music mr-1" />
      {{ $t("nav.slskd") }}
    </h1>

    <!-- Search form -->
    <div class="box mb-4">
      <form @submit.prevent="onSearch">
        <div class="search-form-row">
          <SFormItem :label="$t('search.label')" class="search-form-query">
            <SInput v-model="query" :placeholder="$t('search.placeholder')">
              <template #prefix><span class="mdi mdi-magnify" /></template>
            </SInput>
          </SFormItem>
          <SButton variant="primary" native-type="submit" :loading="searching">
            <span class="mdi mdi-magnify mr-1" /> {{ $t("search.button") }}
          </SButton>
        </div>
      </form>
    </div>

    <!-- Search results tabs -->
    <STabs v-if="searches.length > 0" v-model="activeSearchTab" variant="card" :panes="searchPanes">
      <template v-for="se in searches" :key="'tab-' + se.id" #[`tab-srch-${se.id}`]>
        <span class="tab-label-wrap">
          <span v-if="se.state === 'InProgress' || se.state === 'Started'" class="mdi mdi-loading mdi-spin tab-status-icon" />
          <span v-else-if="se.state === 'Completed' || se.state === 'Completed, ResponseLimitReached'" class="mdi mdi-check tab-status-icon has-text-success" />
          <span class="tab-label-text">{{ se.searchText }}</span>
          <span class="tab-count-badge">{{ searchResults[se.id]?.length ?? 0 }}</span>
          <button class="tab-close-btn" :title="$t('slskd.closeTab', 'Cerrar')" @click.stop="removeSearch(se.id)">
            <span class="mdi mdi-close" />
          </button>
        </span>
      </template>

      <STabPane
        v-for="se in searches"
        :key="se.id"
        :name="'srch-' + se.id"
        :label="se.searchText"
        :active="activeSearchTab === 'srch-' + se.id"
      >
        <!-- Status bar -->
        <div v-if="se.state === 'InProgress' || se.state === 'Started'" class="mb-2">
          <span class="is-size-7 has-text-grey">
            <span class="mdi mdi-loading mdi-spin mr-1" />
            {{ (searchResults[se.id] ?? []).length ? $t("search.resultsCount", { count: (searchResults[se.id] ?? []).length }) : $t("slskd.search.searching", "Buscando...") }}
          </span>
          <SButton variant="warning" size="sm" class="ml-2" :loading="stoppingId === se.id" @click="stopSearch(se.id)">
            <span class="mdi mdi-stop mr-1" /> {{ $t("search.stop") }}
          </SButton>
        </div>

        <SearchResultsTable
          :data="searchResults[se.id] ?? []"
          :columns="columns"
          :loading="loadingSearchResults[se.id] ?? false"
          :total="(searchResults[se.id] ?? []).length"
          :page-size="50"
          :page="searchPage[se.id] ?? 1"
          empty-text=" "
          row-key="id"
          @update:page="searchPage[se.id] = $event"
        >
          <template #cell-free="{ row }">
            <span
              v-if="row.hasFreeUploadSlot && !row.isLocked"
              class="mdi mdi-check-circle has-text-success"
              :title="$t('slskd.search.freeSlot')"
            />
            <span
              v-else
              class="mdi mdi-lock has-text-warning"
              :title="row.isLocked ? $t('slskd.search.fileLocked') : $t('slskd.search.queueLength', { n: row.queueLength })"
            />
          </template>
          <template #cell-username="{ row }">
            <span class="mdi mdi-account mr-1 user-ctx-trigger" /> <span class="user-ctx-trigger">{{ row.username }}</span>
          </template>
          <template #cell-speed="{ row }">{{ formatSpeed(row.uploadSpeed) }}</template>
          <template #cell-folder="{ row }">
            <span class="folder-ctx-trigger" :title="row.folder">{{ row.folder || "\u2014" }}</span>
          </template>
          <template #cell-filename="{ row }">
            <span :title="row.filename">{{ row.filename }}</span>
          </template>
          <template #cell-size="{ row }">{{ formatSize(row.size) }}</template>
          <template #cell-attributes="{ row }">
            <span v-if="row.bitRate || row.sampleRate" class="nowrap">
              {{ row.bitRate ? `${row.bitRate} kbps` : "" }}
              {{ row.sampleRate ? `${row.sampleRate / 1000} kHz` : "" }}
              {{ row.bitDepth ? `${row.bitDepth} bit` : "" }}
              {{ row.length ? `${row.length}s` : "" }}
            </span>
            <span v-else class="has-text-grey">\u2014</span>
          </template>
          <template #cell-actions="{ row }">
            <SButton
              variant="success"
              size="sm"
              :loading="downloadingId === row.id"
              @click="startDownload(row)"
              :title="$t('slskd.search.download')"
            >
              <span class="mdi mdi-download" />
            </SButton>
          </template>
        </SearchResultsTable>
      </STabPane>
    </STabs>

    <!-- No results yet -->
    <div v-else class="has-text-centered py-5 has-text-grey">
      <span class="mdi mdi-file-search-outline icon-lg" />
      <p>{{ $t("slskd.search.noSearches") }}</p>
    </div>

    <!-- ── Context menu (username / folder) ──────────── -->
    <SContextMenu
      :visible="ctxMenu.visible"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      @close="closeCtx"
    >
      <div v-if="ctxMenu.type === 'user'" class="s-context-menu-item" @click="ctxOpenChat()">
        <span class="mdi mdi-message-text" /> {{ $t("slskd.sendMessage", "Enviar mensaje") }}
      </div>
      <div v-if="ctxMenu.type === 'user'" class="s-context-menu-item" @click="ctxBrowseFiles()">
        <span class="mdi mdi-folder-open" /> {{ $t("slskd.browseFiles", "Explorar archivos") }}
      </div>
      <div v-if="ctxMenu.type === 'folder'" class="s-context-menu-item" @click="ctxDownloadFolder()">
        <span class="mdi mdi-folder-download" /> {{ $t("slskd.downloadFolder", "Descargar carpeta") }}
      </div>
    </SContextMenu>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const { addToast } = useToast();
const router = useRouter();

// ── Types ───────────────────────────────────────────────────────────────────

interface SlskdSearch {
  id: string;
  searchText: string;
  state: string;
  fileCount: number;
  startedAt?: string;
}

interface SlskdResponse {
  id: number;
  username: string;
  filename: string;
  fullFilename: string;
  folder: string;
  size: number;
  bitRate?: number;
  sampleRate?: number;
  bitDepth?: number;
  length?: number;
  hasFreeUploadSlot?: boolean;
  isLocked?: boolean;
  queueLength?: number;
  uploadSpeed?: number;
}

// ── Search state ────────────────────────────────────────────────────────────

const query = ref("");
const searches = ref<SlskdSearch[]>([]);
const loadingSearches = ref(false);
const searching = ref(false);
const stoppingId = ref<string | null>(null);
const downloadingId = ref<number | null>(null);
const searchResults = ref<Record<string, SlskdResponse[]>>({});
const loadingSearchResults = ref<Record<string, boolean>>({});
const searchPage = ref<Record<string, number>>({});
const activeSearchTab = ref<string | null>(null);

const searchPanes = computed(() =>
  searches.value.map((s) => ({ name: "srch-" + s.id, label: s.searchText })),
);

const columns = computed(() => [
  { key: "free", label: "", width: 35, align: "center" as const },
  { key: "username", label: t("slskd.search.columns.username"), width: 80, minWidth: 80 },
  { key: "speed", label: t("slskd.search.columns.speed"), width: 70, align: "right" as const },
  { key: "folder", label: t("slskd.search.columns.folder"), width: 270 },
  { prop: "filename", label: t("slskd.search.columns.filename"), width: 300 },
  { prop: "size", label: t("slskd.search.columns.size"), width: 85, align: "right" as const },
  { key: "attributes", label: t("slskd.search.columns.attributes"), width: 180, align: "right" as const },
  { key: "actions", label: "", width: 50, align: "center" as const },
]);

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Context menu ────────────────────────────────────────────────────────────

const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: "" as "user" | "folder",
  username: "",
  row: null as SlskdResponse | null,
});

function onUserContextmenu(event: MouseEvent, username: string) {
  ctxMenu.visible = true;
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.type = "user";
  ctxMenu.username = username;
  ctxMenu.row = null;
}

function onFolderContextmenu(event: MouseEvent, row: SlskdResponse) {
  ctxMenu.visible = true;
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.type = "folder";
  ctxMenu.username = row.username;
  ctxMenu.row = row;
}

function onUserCtx(event: MouseEvent, username: string) {
  event.preventDefault();
  event.stopPropagation();
  onUserContextmenu(event, username);
}

function onFolderCtx(event: MouseEvent, row: SlskdResponse) {
  event.preventDefault();
  event.stopPropagation();
  onFolderContextmenu(event, row);
}

function closeCtx() {
  ctxMenu.visible = false;
}

function ctxOpenChat() {
  closeCtx();
  const username = ctxMenu.username;
  if (!username) return;
  router.push(`/slskd/chat#user:${encodeURIComponent(username)}`);
}

function ctxBrowseFiles() {
  closeCtx();
  const username = ctxMenu.username;
  if (!username) return;
  router.push(`/slskd/chat#files:${encodeURIComponent(username)}`);
}

async function ctxDownloadFolder() {
  closeCtx();
  const row = ctxMenu.row;
  if (!row) return;
  const allResults = Object.values(searchResults.value).flat();
  const files = allResults
    .filter((r) => r.username === row.username && r.folder === row.folder)
    .map((r) => ({ filename: r.fullFilename, size: r.size }));
  if (!files.length) {
    addToast(t("slskd.search.noFilesInFolder", "No se encontraron archivos en la carpeta"), "error");
    return;
  }
  try {
    await apiFetch("/api/slskd/transfers", {
      method: "POST",
      body: { username: row.username, files },
    });
    apiFetch("/api/download-history", {
      method: "POST",
      body: { url: row.folder, title: row.folder, service: "slskd" },
    }).catch(() => {});
    addToast(t("slskd.search.downloadStarted", { file: row.folder }), "success");
  } catch (err: any) {
    addToast(err?.message ?? t("slskd.search.downloadError"), "error");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATE_TAG: Record<string, "default" | "primary" | "success" | "warning" | "danger" | "info"> = {
  InProgress: "info",
  Started: "info",
  Completed: "success",
  NoResults: "default",
  Cancelled: "warning",
  Error: "danger",
  "Completed, ResponseLimitReached": "success",
};

function stateTag(state: string): "default" | "primary" | "success" | "warning" | "danger" | "info" {
  return STATE_TAG[state] ?? "default";
}

function stateLabel(state: string): string {
  const key = `slskd.search.states.${state}`;
  const fallback: Record<string, string> = {
    InProgress: "Searching",
    Started: "Started",
    Completed: "Completed",
    NoResults: "No Results",
    Cancelled: "Cancelled",
    Error: "Error",
    "Completed, ResponseLimitReached": "Completed (limit)",
  };
  return t(key) !== key ? t(key) : (fallback[state] ?? state);
}

function formatSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return "\u2014";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number | undefined | null): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "\u2014";
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
}

// ── API ─────────────────────────────────────────────────────────────────────

async function fetchSearches() {
  try {
    const data = await apiFetch<SlskdSearch[]>("/api/slskd/searches");
    searches.value = data ?? [];
  } catch {
    // silent
  }
}

async function fetchResponses(searchId: string) {
  loadingSearchResults.value[searchId] = true;
  try {
    const data = await apiFetch<SlskdResponse[]>(
      `/api/slskd/searches/${searchId}/responses`,
    );
    searchResults.value[searchId] = data ?? [];
  } catch {
    searchResults.value[searchId] = [];
  } finally {
    loadingSearchResults.value[searchId] = false;
  }
}

async function onSearch() {
  const text = query.value.trim();
  if (!text) return;

  searching.value = true;
  try {
    const id = crypto.randomUUID();
    await apiFetch("/api/slskd/searches", {
      method: "POST",
      body: { id, searchText: text },
    });
    query.value = "";
    // Initialize per-search state
    searchResults.value[id] = [];
    loadingSearchResults.value[id] = false;
    searchPage.value[id] = 1;
    await fetchSearches();
    // Switch to the new search tab
    activeSearchTab.value = "srch-" + id;
    addToast(t("slskd.search.searchStarted", { query: text }), "success");
    // Fetch responses shortly after creation (don't wait for poll cycle)
    setTimeout(() => {
      if (searchResults.value[id] !== undefined && (searchResults.value[id]?.length ?? 0) === 0) {
        fetchResponses(id);
      }
    }, 2000);
  } catch (err: any) {
    addToast(err?.message ?? t("slskd.search.searchError"), "error");
  } finally {
    searching.value = false;
  }
}

async function stopSearch(id: string) {
  stoppingId.value = id;
  try {
    await apiFetch(`/api/slskd/searches/${id}`, {
      method: "PUT",
    });
    await fetchSearches();
    addToast(t("slskd.search.searchStopped"), "info");
  } catch (err: any) {
    addToast(err?.message ?? t("slskd.search.actionError"), "error");
  } finally {
    stoppingId.value = null;
  }
}

async function removeSearch(id: string) {
  try {
    await apiFetch(`/api/slskd/searches/${id}`, {
      method: "DELETE",
    });
    delete searchResults.value[id];
    delete loadingSearchResults.value[id];
    delete searchPage.value[id];
    await fetchSearches();
  } catch (err: any) {
    addToast(err?.message ?? t("slskd.search.actionError"), "error");
  }
}

async function startDownload(item: SlskdResponse) {
  downloadingId.value = item.id;
  try {
    await apiFetch("/api/slskd/transfers", {
      method: "POST",
      body: { username: item.username, files: [{ filename: item.fullFilename, size: item.size }] },
    });
    apiFetch("/api/download-history", {
      method: "POST",
      body: { url: item.fullFilename, title: item.filename, service: "slskd" },
    }).catch(() => {});
    addToast(t("slskd.search.downloadStarted", { file: item.filename }), "success");
  } catch (err: any) {
    addToast(err?.message ?? t("slskd.search.downloadError"), "error");
  } finally {
    downloadingId.value = null;
  }
}

// ── Polling ─────────────────────────────────────────────────────────────────

async function pollActiveSearches() {
  await fetchSearches();
  for (const s of searches.value) {
    const cached = searchResults.value[s.id];
    // Fetch if search is still active, OR if completed/ended but no results cached yet
    if (s.state === "InProgress" || s.state === "Started" || !cached || cached.length === 0) {
      await fetchResponses(s.id);
    }
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(async () => {
  loadingSearches.value = true;
  await fetchSearches();
  loadingSearches.value = false;

  // Auto-select latest search tab
  if (searches.value.length > 0) {
    const latest = searches.value[searches.value.length - 1];
    activeSearchTab.value = "srch-" + latest.id;
    fetchResponses(latest.id);
  }

  pollTimer = setInterval(pollActiveSearches, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

// Direct document-level delegation for context menu on search results
const ctxHandler = (e: Event) => {
  const tr = (e.target as HTMLElement).closest(".s-table tbody tr");
  if (!tr) return;
  const sTable = tr.closest(".s-table");
  if (!sTable || !sTable.closest(".search-results-table")) return;

  const rowIdx = Array.from(tr.parentElement!.children).indexOf(tr);
  if (rowIdx == null || rowIdx < 0) return;

  const pageSize = 50;
  const activeTabName = activeSearchTab.value;
  let activeResults: any[];
  if (activeTabName && activeTabName.startsWith("srch-")) {
    const searchId = activeTabName.slice(5);
    activeResults = searchResults.value[searchId] ?? [];
  } else {
    return;
  }
  const page = searchPage.value[activeTabName?.slice(5)] ?? 1;
  const actualIdx = (page - 1) * pageSize + rowIdx;
  if (actualIdx >= activeResults.length) return;
  const row = activeResults[actualIdx];
  if (!row) return;

  const cell = (e.target as HTMLElement).closest("td");
  if (!cell) return;
  const cellIdx = Array.from(cell.parentElement!.children).indexOf(cell);

  const colKeys = columns.value.map((c: any) => c.key || c.prop);
  const colKey = colKeys[cellIdx];

  if (colKey === "username") {
    e.preventDefault();
    e.stopPropagation();
    onUserCtx(e as MouseEvent, row.username);
  } else if (colKey === "folder") {
    e.preventDefault();
    e.stopPropagation();
    onFolderCtx(e as MouseEvent, row);
  }
};

onMounted(() => {
  document.addEventListener("contextmenu", ctxHandler);
});

onUnmounted(() => {
  document.removeEventListener("contextmenu", ctxHandler);
});
</script>

<style scoped>
.search-form-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.search-form-query {
  flex: 1;
  min-width: 0;
}

@media (max-width: 480px) {
  .search-form-row {
    flex-wrap: wrap;
  }
  .search-form-query {
    flex: 1 1 100%;
  }
}

/* ── Tab header slots ─────────────────────────────────── */
.tab-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.tab-status-icon {
  font-size: 0.7rem;
}
.tab-label-text {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 9px;
  background: var(--s-border);
  color: var(--s-text-secondary);
}
.tab-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 3px;
  font-size: 0.6rem;
  color: var(--s-text-secondary);
  opacity: 0.5;
  transition: opacity 0.15s;
  padding: 0;
}
.tab-close-btn:hover {
  opacity: 1;
  background: var(--s-border);
  color: var(--s-danger);
}

/* ── Context menu trigger ─────────────────────────────── */
.user-ctx-trigger,
.folder-ctx-trigger {
  cursor: pointer;
}
.user-ctx-trigger:hover,
.folder-ctx-trigger:hover {
  text-decoration: underline;
}
</style>
