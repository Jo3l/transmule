<template>
  <div>
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-magnify mr-1" />
      {{ $t("torrentSearch.title") }}
    </h1>

    <div class="box mb-4">
      <form @submit.prevent="doSearch">
        <div class="columns is-multiline">
          <div class="column is-6">
            <SFormItem :label="$t('torrentSearch.label')">
              <SInput v-model="query" :placeholder="$t('torrentSearch.placeholder')" autofocus>
                <template #prefix><span class="mdi mdi-magnify" /></template>
              </SInput>
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('torrentSearch.source')">
              <SSelect v-model="source" :options="sourceOptions" />
            </SFormItem>
          </div>
        </div>
        <SButton variant="primary" native-type="submit" :loading="loading">
          <span class="mdi mdi-magnify mr-1" /> {{ $t("torrentSearch.button") }}
        </SButton>
        <SButton class="ml-3" @click.prevent="openTrackers">
          <span class="mdi mdi-antenna mr-1" /> {{ $t("torrentSearch.trackers") }}
        </SButton>
      </form>
    </div>

    <STable :data="results" :columns="columns" row-key="infoHash" :loading="loading">
      <!-- Name cell -->
      <template #cell-name="{ row }">
        <span :title="row.name">{{ row.name }}</span>
      </template>

      <!-- Source badge -->
      <template #cell-source="{ row }">
        <STag :variant="sourceVariant(row.source)" size="sm">
          <span
            v-if="providerIconMap[row.source]"
            class="mdi"
            :class="providerIconMap[row.source]"
            style="margin-right: 3px"
          />{{ providerLabelMap[row.source] ?? row.source }}
        </STag>
      </template>

      <!-- Seeders (green) -->
      <template #cell-seeders="{ row }">
        <span :class="row.seeders > 0 ? 'has-text-success' : 'has-text-grey'">
          {{ row.seeders }}
        </span>
      </template>

      <!-- Leechers (danger) -->
      <template #cell-leechers="{ row }">
        <span :class="row.leechers > 0 ? 'has-text-danger' : 'has-text-grey'">
          {{ row.leechers }}
        </span>
      </template>

      <!-- Add / Added action -->
      <template #cell-actions="{ row }">
        <SButton
          v-if="!addedHashes.has(row.infoHash)"
          :variant="isDownloadedByHash(row.infoHash) ? 'warning' : 'success'"
          size="sm"
          :loading="addingHash === row.infoHash"
          :title="$t('torrentSearch.addToTransmission')"
          @click="addTorrent(row)"
        >
          <span class="mdi mdi-plus" />
        </SButton>
        <span
          v-else
          class="mdi mdi-check has-text-success"
          :title="$t('torrentSearch.alreadyAdded')"
        />
      </template>

      <!-- Empty state -->
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          <span class="mdi mdi-file-search-outline icon-lg" />
          <p>
            {{ searched ? $t("torrentSearch.noResults") : $t("torrentSearch.enterSearch") }}
          </p>
        </div>
      </template>
    </STable>

    <!-- Error -->
    <p v-if="error" class="has-text-danger mt-3">{{ error }}</p>

    <!-- BT Trackers Dialog -->
    <SDialog v-model="trackersDialog" :title="$t('torrentSearch.trackersTitle')" width="520px">
      <p class="is-size-7 has-text-grey mb-1">{{ $t("torrentSearch.trackersDescription") }}</p>
      <p class="is-size-7 mb-3">
        {{ $t("torrentSearch.trackersGuide") }}
        <a href="https://dontorrent.blog/trackers-utorrent/" target="_blank" rel="noopener">
          dontorrent.blog/trackers-utorrent
        </a>
      </p>
      <textarea
        v-model="trackersText"
        class="trackers-textarea"
        :placeholder="$t('torrentSearch.trackersPlaceholder')"
      />
      <template #footer>
        <SButton variant="primary" :loading="savingTrackers" @click="saveAndClose">
          <span class="mdi mdi-content-save mr-1" /> {{ $t("settings.save") }}
        </SButton>
      </template>
    </SDialog>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const { t } = useI18n();
const { addToast } = useToast();
const { isDownloadedByHash, recordDownload, loadDownloadHistory } = useDownloadHistory();
const { torrentSearchProviders, loadProviders } = useProviders();

// ── Source options (dynamic — built from registered torrent-search plugins) ──

const sourceOptions = computed(() => [
  { label: t("torrentSearch.sources.all"), value: "all" },
  ...torrentSearchProviders.value.map((p) => ({
    label: p.name,
    value: p.id,
  })),
]);

// ── Columns ─────────────────────────────────────────────────────────────────

const columns = computed(() => [
  { prop: "name", label: t("torrentSearch.columns.name"), sortable: true },
  {
    prop: "category",
    label: t("torrentSearch.columns.category"),
    width: 140,
    sortable: true,
  },
  {
    prop: "size_fmt",
    label: t("torrentSearch.columns.size"),
    width: 110,
    sortable: true,
  },
  {
    key: "seeders",
    prop: "seeders",
    label: t("torrentSearch.columns.seeders"),
    width: 80,
    sortable: true,
    align: "right" as const,
  },
  {
    key: "leechers",
    prop: "leechers",
    label: t("torrentSearch.columns.leechers"),
    width: 80,
    sortable: true,
    align: "right" as const,
  },
  {
    key: "source",
    label: t("torrentSearch.columns.source"),
    width: 80,
    align: "center" as const,
  },
  {
    key: "actions",
    label: "",
    width: 55,
    align: "center" as const,
  },
]);

// ── State ────────────────────────────────────────────────────────────────────

const query = ref("");
const source = ref("all");
const loading = ref(false);
const searched = ref(false);
const error = ref("");

interface SearchResult {
  name: string;
  magnet: string;
  infoHash: string;
  size: number | null;
  size_fmt: string;
  seeders: number;
  leechers: number;
  source: string;
  category: string | null;
}

const results = ref<SearchResult[]>([]);
const addingHash = ref("");
const addedHashes = ref(new Set<string>());

// ── Per-plugin display helpers (dynamic — driven by loaded plugins) ───────────

const VARIANT_PALETTE = ["primary", "success", "warning", "info", "accent"] as const;

const providerLabelMap = computed<Record<string, string>>(() =>
  Object.fromEntries(torrentSearchProviders.value.map((p) => [p.id, p.name])),
);

const providerIconMap = computed<Record<string, string>>(() =>
  Object.fromEntries(torrentSearchProviders.value.map((p) => [p.id, p.icon])),
);

const providerVariantMap = computed<Record<string, (typeof VARIANT_PALETTE)[number]>>(() =>
  Object.fromEntries(
    torrentSearchProviders.value.map((p, i) => [p.id, VARIANT_PALETTE[i % VARIANT_PALETTE.length]]),
  ),
);

function sourceVariant(src: string) {
  return providerVariantMap.value[src] ?? "default";
}

// ── Search ───────────────────────────────────────────────────────────────────

async function doSearch() {
  if (!query.value.trim()) return;

  loading.value = true;
  searched.value = true;
  error.value = "";
  results.value = [];

  // Also refresh which hashes are already in Transmission
  fetchExistingHashes();

  try {
    const res = await apiFetch<{ results: SearchResult[] }>(
      `/api/torrent-search?q=${encodeURIComponent(query.value.trim())}&source=${source.value}&limit=100`,
    );
    results.value = (res?.results ?? []).map((r) => ({
      ...r,
      size_fmt: formatBytes(r.size),
      category: r.category ?? "-",
    }));
  } catch (err: any) {
    error.value = err?.message ?? t("torrentSearch.searchError");
  } finally {
    loading.value = false;
  }
}

// ── Track existing Transmission torrents ────────────────────────────────────

async function fetchExistingHashes() {
  if (!transmissionRunning.value) return;
  try {
    const res = await apiFetch<any>("/api/transmission/torrents");
    const torrents = res?.torrents ?? [];
    addedHashes.value = new Set(torrents.map((t: any) => (t.hashString ?? "").toLowerCase()));
  } catch {
    /* silent */
  }
}

// ── Add torrent to Transmission ──────────────────────────────────────────────

async function addTorrent(row: SearchResult) {
  addingHash.value = row.infoHash;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: row.magnet },
    });
    addedHashes.value.add(row.infoHash.toLowerCase());
    recordDownload(row.magnet, row.name, "transmission");
    addToast(t("torrentSearch.added", { name: row.name }), "success");
  } catch (err: any) {
    addToast(err?.message ?? t("torrentSearch.addError"), "error");
  } finally {
    addingHash.value = "";
  }
}

// ── BT Trackers ──────────────────────────────────────────────────────────────

const trackersDialog = ref(false);
const { trackersText, savingTrackers, loadTrackers, saveTrackers } = useTrackers();

async function openTrackers() {
  await loadTrackers();
  trackersDialog.value = true;
}

async function saveAndClose() {
  await saveTrackers();
  trackersDialog.value = false;
}

// ── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  fetchExistingHashes();
  await loadDownloadHistory();
  await loadProviders();
});
</script>

<style scoped>
.trackers-textarea {
  width: 100%;
  min-height: 180px;
  font-family: monospace;
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
  resize: vertical;
  border: 1px solid var(--s-border);
  background: var(--s-input-bg, var(--s-bg));
  color: var(--s-text);
  border-radius: 4px;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.trackers-textarea:focus {
  border-color: var(--s-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--s-accent) 20%, transparent);
}
</style>
