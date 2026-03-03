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
              <SInput
                v-model="query"
                :placeholder="$t('torrentSearch.placeholder')"
                autofocus
              >
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
      </form>
    </div>

    <STable
      :data="results"
      :columns="columns"
      row-key="infoHash"
      :loading="loading"
    >
      <!-- Name cell -->
      <template #cell-name="{ row }">
        <span :title="row.name">{{ row.name }}</span>
      </template>

      <!-- Source badge -->
      <template #cell-source="{ row }">
        <STag :variant="sourceVariant(row.source)" size="sm">
          {{ row.source.toUpperCase() }}
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
          variant="success"
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
            {{
              searched
                ? $t("torrentSearch.noResults")
                : $t("torrentSearch.enterSearch")
            }}
          </p>
        </div>
      </template>
    </STable>

    <!-- Error -->
    <p v-if="error" class="has-text-danger mt-3">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const { t } = useI18n();
const { addToast } = useToast();

// ── Source options ──────────────────────────────────────────────────────────

const sourceOptions = computed(() => [
  { label: t("torrentSearch.sources.all"), value: "all" },
  { label: t("torrentSearch.sources.tpb"), value: "tpb" },
  { label: t("torrentSearch.sources.nyaa"), value: "nyaa" },
  { label: t("torrentSearch.sources.yts"), value: "yts" },
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function sourceVariant(
  src: string,
): "primary" | "success" | "warning" | "info" {
  const map: Record<string, "primary" | "success" | "warning" | "info"> = {
    tpb: "primary",
    nyaa: "success",
    yts: "warning",
  };
  return map[src] ?? "info";
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
    addedHashes.value = new Set(
      torrents.map((t: any) => (t.hashString ?? "").toLowerCase()),
    );
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
    addToast(t("torrentSearch.added", { name: row.name }), "success");
  } catch (err: any) {
    addToast(err?.message ?? t("torrentSearch.addError"), "error");
  } finally {
    addingHash.value = "";
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

onMounted(() => {
  fetchExistingHashes();
});
</script>
