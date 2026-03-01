<template>
  <div>
    <h1 class="title is-4 mb-4">{{ $t("search.title") }}</h1>

    <div class="box mb-4">
      <form @submit.prevent="startSearch">
        <div class="columns is-multiline">
          <div class="column is-6">
            <SFormItem :label="$t('search.label')">
              <SInput v-model="query" :placeholder="$t('search.placeholder')">
                <template #prefix><span class="mdi mdi-magnify" /></template>
              </SInput>
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('search.type')">
              <SSelect
                v-model="searchType"
                :options="[
                  { label: $t('search.global'), value: 'Global' },
                  { label: $t('search.local'), value: 'Local' },
                  { label: $t('search.kad'), value: 'KAD' },
                ]"
              />
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('search.minSources')">
              <SInput v-model="avail" type="number" placeholder="0" />
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('search.minSize')">
              <div style="display: flex; gap: 0.5rem">
                <SInput v-model="minSize" type="number" placeholder="0" />
                <SSelect v-model="minSizeUnit" :options="sizeUnits" />
              </div>
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('search.maxSize')">
              <div style="display: flex; gap: 0.5rem">
                <SInput v-model="maxSize" type="number" placeholder="0" />
                <SSelect v-model="maxSizeUnit" :options="sizeUnits" />
              </div>
            </SFormItem>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem">
          <SButton
            variant="primary"
            native-type="submit"
            :loading="searching"
            :disabled="pollActive"
          >
            <span class="mdi mdi-magnify mr-1" /> {{ $t("search.button") }}
          </SButton>
          <SButton
            v-if="pollActive"
            variant="warning"
            size="sm"
            @click="stopSearch"
          >
            <span class="mdi mdi-stop mr-1" /> {{ $t("search.stop") }}
          </SButton>
          <span v-if="pollActive" class="has-text-grey is-size-7">
            {{ $t("search.searching") }} {{ Math.round(progress * 100) }}%
          </span>
        </div>
      </form>
    </div>

    <STable
      :data="results"
      :columns="columns"
      :loading="loadingResults"
      row-key="hash"
    >
      <template #cell-name="{ row }">
        <span :class="{ 'has-text-danger': downloadedHashes.has(row.hash) }">{{
          row.name
        }}</span>
      </template>
      <template #cell-sources="{ row }">{{ row.sources }}</template>
      <template #cell-actions="{ row }">
        <SButton
          v-if="!downloadedHashes.has(row.hash)"
          variant="success"
          size="sm"
          :loading="downloadingHash === row.hash"
          :title="$t('search.download')"
          @click="downloadOne(row)"
        >
          <span class="mdi mdi-download" />
        </SButton>
        <span
          v-else
          class="mdi mdi-check has-text-success"
          :title="$t('search.alreadyDownloading')"
        />
      </template>
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          <span class="mdi mdi-file-search-outline" style="font-size: 2rem" />
          <p>
            {{ searched ? $t("search.noResults") : $t("search.enterSearch") }}
          </p>
        </div>
      </template>
    </STable>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();

const sizeUnits = computed(() => [
  { label: t("search.sizeUnits.bytes"), value: "1" },
  { label: t("search.sizeUnits.kb"), value: "1024" },
  { label: t("search.sizeUnits.mb"), value: "1048576" },
  { label: t("search.sizeUnits.gb"), value: "1073741824" },
]);

const columns = computed(() => [
  { prop: "name", label: t("search.columns.name"), sortable: true },
  {
    prop: "size_fmt",
    label: t("search.columns.size"),
    width: 120,
    sortable: true,
  },
  {
    prop: "sources",
    label: t("search.columns.sources"),
    width: 90,
    sortable: true,
    align: "right" as const,
  },
  { key: "actions", label: "", width: 50 },
]);

const query = ref("");
const searchType = ref("Global");
const avail = ref("");
const minSize = ref("");
const minSizeUnit = ref("1048576");
const maxSize = ref("");
const maxSizeUnit = ref("1048576");
const searching = ref(false);
const loadingResults = ref(false);
const searched = ref(false);
const results = ref<any[]>([]);
const downloadingHash = ref("");
const progress = ref(0);
const pollActive = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Track hashes already in the download queue
const downloadedHashes = ref(new Set<string>());

async function fetchDownloadHashes() {
  try {
    const res = await apiFetch<any>("/api/amule/downloads");
    const files = res?.downloads?.files || [];
    downloadedHashes.value = new Set(files.map((f: any) => f.hash));
  } catch {
    /* silent */
  }
}

function toBytes(val: string, unit: string): number | undefined {
  const n = Number(val);
  if (!n) return undefined;
  return n * Number(unit);
}

async function startSearch() {
  searching.value = true;
  searched.value = true;
  results.value = [];
  downloadingHash.value = "";
  progress.value = 0;
  loadingResults.value = true;
  try {
    await fetchDownloadHashes();
    const body: Record<string, any> = {
      action: "search",
      query: query.value,
      type: searchType.value,
    };
    if (avail.value) body.avail = Number(avail.value);
    const min = toBytes(minSize.value, minSizeUnit.value);
    if (min) body.min_size = min;
    const max = toBytes(maxSize.value, maxSizeUnit.value);
    if (max) body.max_size = max;
    await apiFetch("/api/amule/search", { method: "POST", body });
    startPolling();
  } catch {
    /* handled */
  } finally {
    searching.value = false;
  }
}

function startPolling() {
  stopPolling();
  pollActive.value = true;
  setTimeout(async () => {
    await fetchResults();
    loadingResults.value = false;
  }, 1500);
  pollTimer = setInterval(fetchResults, 3000);
}

function stopPolling() {
  pollActive.value = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchResults() {
  try {
    const res = await apiFetch<any>("/api/amule/search");
    const incoming = res?.results?.files || [];

    // Merge in-place: update existing rows, add new ones — avoids DOM thrashing
    const existingMap = new Map(results.value.map((r: any) => [r.hash, r]));
    for (const file of incoming) {
      const existing = existingMap.get(file.hash);
      if (existing) {
        Object.assign(existing, file);
      } else {
        results.value.push(file);
      }
    }

    progress.value = res?.progress ?? 0;
    if (progress.value >= 1) stopPolling();
  } catch {
    /* handled */
  }
}

async function stopSearch() {
  try {
    await apiFetch("/api/amule/search", { method: "POST", body: { action: "stop" } });
  } finally {
    stopPolling();
    await fetchResults();
  }
}

async function downloadOne(row: any) {
  downloadingHash.value = row.hash;
  try {
    await apiFetch("/api/amule/search", {
      method: "POST",
      body: {
        action: "download",
        hashes: [row.hash],
      },
    });
    // Mark as downloaded immediately, then refresh full list
    downloadedHashes.value.add(row.hash);
    await fetchDownloadHashes();
  } finally {
    downloadingHash.value = "";
  }
}

onMounted(() => {
  fetchDownloadHashes();
});

onUnmounted(() => {
  stopPolling();
});
</script>
