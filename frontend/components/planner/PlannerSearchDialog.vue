<template>
  <SDialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="920px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <SAlert v-if="errorMsg" variant="error" size="sm" class="mb-3">
      {{ errorMsg }}
    </SAlert>

    <!-- Toolbar: spinner (mientras busca) + filtro por red + contador -->
    <div class="psd-toolbar mb-3">
      <span v-if="searching" class="mdi mdi-loading mdi-spin psd-spinner" />
      <SSelect v-model="networkFilter" style="min-width: 180px">
        <option value="all">{{ $t("planner.allNetworks") }}</option>
        <option value="direct-plugin">Torrent</option>
        <option value="slskd">Soulseek</option>
        <option value="amule">ED2K</option>
      </SSelect>
      <span class="has-text-grey is-size-7">{{ filtered.length }} {{ $t("planner.results") }}</span>
    </div>

    <div v-if="filtered.length === 0" class="box has-text-centered">
      <p>
        <span
          class="is-size-2 has-text-grey-light"
          :class="searching ? 'mdi mdi-magnify' : 'mdi mdi-magnify-close'"
        />
      </p>
      <p class="has-text-grey">
        {{ searching ? $t("planner.searchingReleases") : $t("planner.noResultsFor", { query: searchQuery }) }}
      </p>
    </div>

    <STable
      v-else
      :data="filtered"
      :columns="columns"
      row-key="url"
      :stripe="true"
    >
      <template #cell-service="{ row }">
        <span class="mdi psd-net-icon" :class="serviceIcon(row.service)" />
      </template>
      <template #cell-name="{ row }">
        <div class="psd-name" :title="row.rawName">
          {{ row.rawName }}
        </div>
        <div v-if="row.rejectedReason" class="has-text-danger is-size-7">
          {{ $t("planner.rejected") }}: {{ row.rejectedReason }}
        </div>
      </template>
      <template #cell-quality="{ row }">
        <STag>{{ qualityLabel(row.quality) }}</STag>
      </template>
      <template #cell-size="{ row }">
        {{ formatSize(row.sizeMb) }}
      </template>
      <template #cell-seeds="{ row }">
        <span v-if="row.seeds != null" class="has-text-success">
          <span class="mdi mdi-arrow-up-bold" /> {{ row.seeds }}
        </span>
        <span v-else class="has-text-grey">—</span>
      </template>
      <template #cell-languages="{ row }">
        <span v-if="row.languages.length" class="has-text-grey is-size-7">
          {{ row.languages.join(" / ") }}
        </span>
        <span v-else class="has-text-grey">—</span>
      </template>
      <template #cell-score="{ row }">
        <span v-if="row.rejectedReason" class="has-text-grey">—</span>
        <span v-else class="psd-score">{{ row.score }}</span>
      </template>
      <template #cell-actions="{ row }">
        <SButton
          size="sm"
          variant="primary"
          icon="mdi-download"
          :loading="grabbingId === row.url"
          @click="download(row)"
        >
          {{ $t("planner.download") }}
        </SButton>
      </template>
    </STable>
  </SDialog>
</template>

<script setup lang="ts">
import type { ReleaseCandidate } from "~/composables/usePlanner";

const props = defineProps<{
  modelValue: boolean;
  mediaType: "series" | "movie";
  title: string;
  season?: number;
  episode?: number;
  /** Título del episodio localizado (idioma elegido) — bonus de scoring. */
  episodeTitle?: string;
  year?: number;
  subscriptionId: number;
  episodeId?: number | null;
  movieId?: number | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "grabbed"): void;
}>();

const { t } = useI18n();
const { searchReleasesStreamed, grabRelease } = usePlanner();
const { showToast } = useApi();

const searching = ref(false);
const errorMsg = ref("");
const candidates = ref<ReleaseCandidate[]>([]);
const grabbingId = ref<string | null>(null);
const networkFilter = ref("all");
const seenKeys = new Set<string>();
const abortCtrl = ref<AbortController | null>(null);

const columns = computed(() => [
  { prop: "service", label: "", width: "40px" },
  { prop: "name", label: t("planner.release") },
  { prop: "quality", label: t("planner.quality"), width: "110px" },
  { prop: "size", label: t("planner.size"), width: "100px" },
  { prop: "seeds", label: t("planner.seeds"), width: "80px" },
  { prop: "languages", label: t("planner.language"), width: "130px" },
  { prop: "score", label: t("planner.score"), width: "70px", align: "right" as const },
  { prop: "actions", label: "", width: "110px" },
]);

// String de búsqueda usado en las redes (multi-nomenclatura SxxExx / 1x01 / 101).
const searchQuery = computed(() => {
  if (props.mediaType === "series") {
    const s = String(props.season ?? 0).padStart(2, "0");
    const e = String(props.episode ?? 0).padStart(2, "0");
    const abs = String(props.season ?? 0) + e;
    return `${props.title} S${s}E${e} OR ${props.title} ${props.season}x${e} OR ${props.title} ${abs}`;
  }
  return props.year ? `${props.title} ${props.year}` : props.title;
});

const dialogTitle = computed(() => `${t("planner.searchResults")} — ${searchQuery.value}`);

const filtered = computed(() => {
  if (networkFilter.value === "all") return candidates.value;
  return candidates.value.filter((c) => c.service === networkFilter.value);
});

// Iconos coherentes con la top info bar (ConnectionStatus).
function serviceIcon(service: string | null): string {
  if (service === "slskd") return "mdi-bird";
  if (service === "amule") return "mdi-donkey";
  if (service === "direct-plugin") return "mdi-magnet";
  return "mdi-cloud-outline";
}

function qualityLabel(q: string): string {
  const map: Record<string, string> = {
    uhd: "4K",
    fullhd: "1080p",
    hd: "720p",
    sd: "SD",
  };
  return map[q] ?? (q || "—").toUpperCase();
}

function formatSize(mb: number | null): string {
  if (mb == null || !Number.isFinite(mb)) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

// Unifica resultados idénticos (mismo nombre normalizado + mismo tamaño).
function dedupKey(c: ReleaseCandidate): string {
  const name = (c.rawName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${name}|${c.sizeMb ?? ""}`;
}

function appendCandidates(incoming: ReleaseCandidate[]) {
  for (const c of incoming) {
    const key = dedupKey(c);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    candidates.value.push(c);
  }
  // Mantener ordenados por score desc (los rechazados, score -1, quedan al final).
  candidates.value.sort((a, b) => b.score - a.score);
}

async function runSearch() {
  abortCtrl.value?.abort();
  const ctrl = new AbortController();
  abortCtrl.value = ctrl;

  searching.value = true;
  errorMsg.value = "";
  candidates.value = [];
  seenKeys.clear();
  networkFilter.value = "all";

  try {
    await searchReleasesStreamed(
      {
        type: props.mediaType === "series" ? "episode" : "movie",
        title: props.title,
        subscriptionId: props.subscriptionId,
        episodeTitle: props.episodeTitle,
        ...(props.mediaType === "series"
          ? { season: props.season, episode: props.episode }
          : { year: props.year }),
      },
      (_service, incoming) => appendCandidates(incoming),
      ctrl.signal,
    );
  } catch (err: any) {
    if (ctrl.signal.aborted) return;
    errorMsg.value = err?.message ?? String(err);
  } finally {
    if (!ctrl.signal.aborted) searching.value = false;
  }
}

async function download(c: ReleaseCandidate) {
  grabbingId.value = c.url;
  errorMsg.value = "";
  try {
    await grabRelease({
      subscription_id: props.subscriptionId,
      episode_id: props.episodeId ?? null,
      movie_id: props.movieId ?? null,
      release_title: c.rawName,
      release_url: c.url,
      release_hash: c.hash,
      release_quality: c.quality,
      release_size_mb: c.sizeMb,
      release_seeds: c.seeds,
      service: c.service,
    });
    showToast(t("planner.grabQueued"), "success", 3000);
    emit("grabbed");
    emit("update:modelValue", false);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    grabbingId.value = null;
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) runSearch();
    else abortCtrl.value?.abort();
  },
);

onUnmounted(() => abortCtrl.value?.abort());
</script>

<style scoped>
.psd-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.psd-spinner {
  font-size: 1.1rem;
  color: var(--s-text-secondary, #888);
}
.psd-name {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
}
.psd-net-icon {
  font-size: 1.1rem;
  color: var(--s-text-secondary, #888);
}
.psd-score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--s-accent, #22d3ee);
}
</style>
