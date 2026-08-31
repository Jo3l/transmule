<template>
  <SLoading id="page-planner-series-detail" :loading="loading">
    <div v-if="sub" class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">{{ sub.title }}</h2>
          <STag v-if="plexTag" class="ml-3 plex-tag" :title="$t('planner.inPlex')">Plex</STag>
          <STag class="ml-3" :variant="sub.monitored ? 'success' : 'default'">
            {{ sub.monitored ? $t("planner.monitored") : $t("planner.paused") }}
          </STag>
        </div>
        <div class="level-right">
          <SSwitch
            :model-value="Boolean(sub.monitored)"
            @update:model-value="toggleMonitored"
          />
          <SButton
            variant="primary"
            icon="mdi-magnify"
            :loading="searching"
            @click="manualSearch"
            class="ml-3"
          >
            {{ $t("planner.searchNow") }}
          </SButton>
          <SButton
            variant="default"
            icon="mdi-refresh"
            :loading="refreshing"
            @click="refresh"
            class="ml-2"
          >
            {{ $t("planner.refresh") }}
          </SButton>
          <SButton
            variant="danger"
            icon="mdi-delete"
            class="ml-2"
            @click="showDeleteModal = true"
          >
            {{ $t("planner.delete") }}
          </SButton>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <div class="columns detail-columns">
        <!-- Poster column -->
        <div class="column is-3">
          <div class="box mb-3">
            <figure class="image is-2by3 mb-3">
              <img v-if="sub.poster_url" :src="sub.poster_url" :alt="sub.title" />
              <div v-else class="planner-card-fallback is-flex is-align-items-center is-justify-content-center">
                <span class="mdi mdi-television-play is-size-1" />
              </div>
            </figure>
            <p class="has-text-grey is-size-7">{{ sub.overview }}</p>
          </div>

          <!-- Configuración editable (la misma que se introduce al añadir) -->
          <div class="box">
            <h4 class="title is-6 mb-3">{{ $t("planner.settings") }}</h4>
            <SFormItem :label="$t('planner.minQuality')">
              <SSelect v-model="cfgMinQuality">
                <option value="uhd">4K (Ultra HD)</option>
                <option value="fullhd">1080p (Full HD)</option>
                <option value="hd">720p (HD)</option>
                <option value="sd">480p (SD)</option>
              </SSelect>
            </SFormItem>
            <SFormItem :label="$t('planner.maxSize')">
              <SSelect v-model="cfgMaxSize">
                <option value="">{{ $t("planner.sizeNoLimit") }}</option>
                <option value="256">~256 MB</option>
                <option value="600">~600 MB</option>
                <option value="1024">~1 GB</option>
              </SSelect>
            </SFormItem>
            <SFormItem :label="$t('planner.rootFolder')">
              <div class="planner-folder-row">
                <SInput v-model="cfgRootFolder" class="planner-folder-input" />
                <SButton
                  variant="default"
                  icon="mdi-folder-open"
                  :title="$t('planner.chooseFolder')"
                  @click="openFolderPicker"
                />
              </div>
            </SFormItem>
            <div class="planner-post-tasks">
              <p class="planner-post-tasks-title">{{ $t("planner.postDownloadTasks") }}</p>
              <div class="planner-post-tasks-body">
                <SFormItem :label="$t('planner.smartRename')">
                  <SSwitch v-model="cfgSmartRename" />
                </SFormItem>
                <SFormItem :label="$t('planner.plexScan')">
                  <SSwitch v-model="cfgPlexScan" />
                </SFormItem>
              </div>
            </div>
            <SFormItem :label="$t('planner.language')">
              <SSelect v-model="cfgLanguage">
                <option value="">{{ $t("planner.languageAny") }}</option>
                <option v-for="lang in LANGUAGE_OPTIONS" :key="lang.code" :value="lang.code">
                  {{ lang.name }}
                </option>
              </SSelect>
            </SFormItem>
            <div class="flex-end gap-sm mt-3">
              <SButton variant="primary" icon="mdi-content-save" :loading="savingCfg" @click="saveConfig">
                {{ $t("planner.save") }}
              </SButton>
            </div>
          </div>
        </div>

        <!-- Seasons -->
        <div class="column">
          <div v-for="season in seasons" :key="season.id" class="box mb-3">
            <div class="level mb-2">
              <div class="level-left">
                <h4 class="title is-6 mb-0">
                  {{ $t("planner.season") }} {{ season.season_number }}
                  <STag class="ml-2">
                    {{ downloadedCount(season) }}/{{ season.episode_count ?? 0 }}
                  </STag>
                </h4>
              </div>
              <div class="level-right">
                <span class="has-text-grey is-size-7 mr-2">
                  {{ $t("planner.monitored") }}
                </span>
                <SSwitch
                  :model-value="Boolean(season.monitored)"
                  @update:model-value="(v: boolean) => toggleSeasonMonitored(season, v)"
                />
                <SButton
                  variant="primary"
                  size="sm"
                  icon="mdi-download"
                  class="ml-3"
                  :loading="downloadingSeasonId === season.id"
                  @click="downloadSeasonNow(season)"
                >
                  {{ $t("planner.downloadSeason") }}
                </SButton>
              </div>
            </div>

            <STable
              :data="season.episodes ?? []"
              :columns="episodeColumns"
              row-key="id"
            >
              <template #cell-number="{ row }">
                <span class="has-text-weight-medium">{{ padEpisode(row.episode_number) }}</span>
              </template>
              <template #cell-title="{ row }">
                {{ row.title ?? "—" }}
              </template>
              <template #cell-air_date="{ row }">
                {{ formatDate(row.air_date) }}
              </template>
              <template #cell-status="{ row }">
                <STag :variant="statusClass(row.status)">
                  {{ statusLabel(row.status) }}
                </STag>
              </template>
              <template #cell-plex="{ row }">
                <span
                  v-if="episodeInPlex(row)"
                  class="mdi mdi-check text-success"
                  :title="$t('planner.inPlex')"
                />
                <span v-else class="has-text-grey is-size-7">&mdash;</span>
              </template>
              <template #cell-actions="{ row }">
                <!-- Emitido: botón de descarga manual (búsqueda interactiva).
                     Futuro: switch para monitorizar (auto-descarga al emitir). -->
                <SButton
                  v-if="isAired(row)"
                  size="sm"
                  variant="primary"
                  icon="mdi-download"
                  @click="openEpisodeSearch(row)"
                >
                  {{ $t("planner.download") }}
                </SButton>
                <SSwitch
                  v-else
                  :model-value="Boolean(row.monitored)"
                  @update:model-value="(v: boolean) => toggleEpisodeMonitored(row, v)"
                />
              </template>
            </STable>
          </div>

          <div v-if="seasons.length === 0" class="box has-text-centered">
            <p class="has-text-grey mb-3">{{ $t("planner.noEpisodes") }}</p>
            <SButton variant="primary" size="sm" icon="mdi-refresh" @click="refresh">
              {{ $t("planner.refresh") }}
            </SButton>
          </div>

          <div class="box">
            <h4 class="title is-6 mb-1">{{ $t("planner.history") }}</h4>
            <p class="has-text-grey is-size-7 mb-3">{{ $t("planner.historyHint") }}</p>
            <div v-if="history.length === 0" class="has-text-grey is-size-7">
              {{ $t("planner.historyEmpty") }}
            </div>
            <STable v-else :data="history" :columns="historyColumns" row-key="key">
              <template #cell-timestamp="{ row }">
                {{ histDisplay.formatTimestamp(row.timestamp) }}
              </template>
              <template #cell-kind="{ row }">
                <STag>{{ histDisplay.kindLabel(row.kind) }}</STag>
              </template>
              <template #cell-event="{ row }">
                <STag :variant="histDisplay.eventVariant(row)">{{ histDisplay.eventLabel(row) }}</STag>
              </template>
              <template #cell-detail="{ row }">
                <span :title="histDisplay.detailText(row)">{{ histDisplay.detailText(row) }}</span>
              </template>
            </STable>
          </div>
        </div>
      </div>

      <!-- Confirm delete -->
      <SDialog
        v-model="showDeleteModal"
        :title="$t('planner.delete')"
        width="420px"
      >
        <p>{{ $t("planner.confirmDelete") }}</p>
        <template #footer>
          <div class="planner-delete-footer">
            <SButton variant="default" @click="showDeleteModal = false">
              {{ $t("common.cancel") }}
            </SButton>
            <SButton variant="danger" icon="mdi-delete" @click="confirmDelete">
              {{ $t("planner.delete") }}
            </SButton>
          </div>
        </template>
      </SDialog>

      <!-- Descarga manual de un episodio (búsqueda interactiva) -->
      <PlannerSearchDialog
        v-model="showDownloadDialog"
        media-type="series"
        :title="sub.title"
        :season="downloadTarget?.season_number ?? 0"
        :episode="downloadTarget?.episode_number ?? 0"
        :episode-title="downloadTarget?.title ?? undefined"
        :subscription-id="id"
        :episode-id="downloadTarget?.id ?? null"
        @grabbed="onGrabbed"
      />

      <!-- Selector de carpeta de destino (FolderPickerDialog compartido con el file manager) -->
      <FolderPickerDialog
        v-model="showFolderPicker"
        v-model:path="pickerPath"
        :title="$t('planner.chooseFolder')"
        @select="onFolderPicked"
      />
    </div>
  </SLoading>
</template>

<script setup lang="ts">
import { usePlannerStatusDisplay, usePlannerHistoryDisplay, padEpisode, formatPlannerDate } from "~/composables/usePlannerUi";

const route = useRoute();
const { t } = useI18n();
const { getSubscription, deleteSubscription, searchSubscription, refreshSubscription, updateSubscription, updateEpisode, downloadSeason, getSubscriptionHistory } = usePlanner();
const { statusLabel, statusClass } = usePlannerStatusDisplay();
const histDisplay = usePlannerHistoryDisplay();
const { apiFetch, showToast } = useApi();

const id = Number(route.params.id);
const loading = ref(true);
const errorMsg = ref("");
const sub = ref<any>(null);
const seasons = ref<any[]>([]);
const refreshing = ref(false);
const searching = ref(false);
const showDeleteModal = ref(false);
const showDownloadDialog = ref(false);
const downloadTarget = ref<any>(null);
const downloadingSeasonId = ref<number | null>(null);
const plexTag = ref(false);
const plexConfigured = ref(false);
const plexEpisodes = ref<Set<string>>(new Set()); // "season-episode" presentes en Plex
const history = ref<any[]>([]);

// ── Configuración editable (misma que se introduce al añadir) ───────────────
const LANGUAGE_OPTIONS = [
  { code: "es", name: "Español (es)" },
  { code: "en", name: "English (en)" },
  { code: "fr", name: "Français (fr)" },
  { code: "de", name: "Deutsch (de)" },
  { code: "it", name: "Italiano (it)" },
  { code: "pt", name: "Português (pt)" },
];
const cfgMinQuality = ref<string>("fullhd");
const cfgMaxSize = ref<string>(""); // "" = sin límite
const cfgRootFolder = ref("downloads");
const cfgSmartRename = ref(false);
const cfgPlexScan = ref(false);
const cfgLanguage = ref("");
const savingCfg = ref(false);

// Selector de carpeta de destino (FolderPickerDialog compartido)
const showFolderPicker = ref(false);
const pickerPath = ref("");

function onFolderPicked(p: string) {
  let v = (p ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!v || v === "home" || v === "downloads") v = "downloads";
  else if (v.startsWith("home/")) v = "downloads/" + v.slice(5);
  cfgRootFolder.value = v;
}

function openFolderPicker() {
  let cur = cfgRootFolder.value.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!cur || cur === "home" || cur === "downloads") cur = "home";
  else cur = cur.replace(/^downloads\//, "home/");
  pickerPath.value = cur;
  showFolderPicker.value = true;
}

function loadConfig() {
  const s = sub.value;
  if (!s) return;
  cfgMinQuality.value = s.min_quality ?? "fullhd";
  cfgMaxSize.value = s.max_size_mb ? String(s.max_size_mb) : "";
  cfgRootFolder.value = s.root_folder || "downloads";
  cfgSmartRename.value = Boolean(s.smart_rename);
  cfgPlexScan.value = Boolean(s.plex_scan);
  cfgLanguage.value = s.language || "";
}

async function saveConfig() {
  savingCfg.value = true;
  errorMsg.value = "";
  try {
    await updateSubscription(id, {
      min_quality: cfgMinQuality.value,
      max_size_mb: cfgMaxSize.value ? Number(cfgMaxSize.value) : null,
      root_folder: cfgRootFolder.value,
      smart_rename: cfgSmartRename.value,
      plex_scan: cfgPlexScan.value,
      language: cfgLanguage.value || null,
    });
    const s = sub.value;
    s.min_quality = cfgMinQuality.value;
    s.max_size_mb = cfgMaxSize.value ? Number(cfgMaxSize.value) : null;
    s.root_folder = cfgRootFolder.value;
    s.smart_rename = cfgSmartRename.value ? 1 : 0;
    s.plex_scan = cfgPlexScan.value ? 1 : 0;
    s.language = cfgLanguage.value || null;
    showToast(t("planner.configSaved"), "success", 3000);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    savingCfg.value = false;
  }
}

const episodeColumns = computed(() => {
  const cols: any[] = [
    { prop: "number", label: "#", width: "60px" },
    { prop: "title", label: t("planner.episodeTitle") },
    { prop: "air_date", label: t("planner.airDate"), width: "130px" },
    { prop: "status", label: t("planner.status"), width: "130px" },
  ];
  // Columna "Plex" solo visible con la integración configurada
  if (plexConfigured.value) {
    cols.push({ prop: "plex", label: "Plex", width: "70px" });
  }
  cols.push({ prop: "actions", label: "", width: "110px" });
  return cols;
});

const historyColumns = computed(() => [
  { prop: "timestamp", label: t("planner.date"), width: "130px" },
  { prop: "kind", label: t("planner.searchKind"), width: "110px" },
  { prop: "event", label: t("planner.status"), width: "130px" },
  { prop: "detail", label: t("planner.detail") },
]);

function downloadedCount(season: any): number {
  return (season.episodes ?? []).filter((e: any) => e.status === "downloaded").length;
}
function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
/** Emitido (fecha actual >= fecha de aire) → botón de descarga. */
function isAired(ep: any): boolean {
  return !!ep.air_date && ep.air_date <= localToday();
}
/** Formatea la fecha de aire según el idioma de la suscripción (default inglés). */
function formatDate(dateStr: string | null): string {
  return formatPlannerDate(dateStr, sub.value?.language || "en");
}

/** ¿La serie ya existe en Plex? → tag dorado [plex] + episodios para la columna. */
async function initPlex() {
  try {
    const res = await apiFetch<{ configured: boolean; shows: string[] }>(
      "/api/plex/library",
    );
    if (!res?.configured) return;
    plexConfigured.value = true;

    const title = sub.value?.title ?? "";
    const target = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const list = res.shows ?? [];
    // Igualdad normalizada; si no, "contains" (títulos tipo "01 Alien El 8º
    // Pasajero 1979" incluyen el nombre canónico) con longitud mínima.
    plexTag.value =
      list.includes(target) ||
      (target.length >= 4 && list.some((t) => t.includes(target)));

    // Episodios de la serie (columna "Plex" de la tabla de temporadas).
    // Se pasan tvdb_id/tmdb_id/language para que el backend pruebe también el
    // título ORIGINAL (Plex tiene la serie localizada en unos casos y no en otros).
    if (title) {
      const params = new URLSearchParams({ series: title });
      if (sub.value?.tvdb_id) params.set("tvdb_id", String(sub.value.tvdb_id));
      if (sub.value?.tmdb_id) params.set("tmdb_id", String(sub.value.tmdb_id));
      if (sub.value?.language) params.set("language", sub.value.language);
      apiFetch<{ configured: boolean; found: boolean; episodes: string[] }>(
        `/api/plex/library/episodes?${params.toString()}`,
      )
        .then((ep) => {
          if (ep?.configured) {
            plexEpisodes.value = new Set(ep.episodes ?? []);
            // El match por originalTitle ("Linternas" → "Lanterns") también
            // confirma el tag [plex] aunque el título localizado no coincida.
            if (ep.found) plexTag.value = true;
          }
        })
        .catch(() => {});
    }
  } catch {
    /* Plex caído o sin configurar → sin tag ni columna */
  }
}

function episodeInPlex(row: any): boolean {
  return plexEpisodes.value.has(`${row.season_number}-${row.episode_number}`);
}

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const detail = await getSubscription(id);
    sub.value = detail;
    seasons.value = detail.seasons ?? [];
    history.value = await getSubscriptionHistory(id);
    loadConfig();
    void initPlex();
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  try {
    await refreshSubscription(id);
    await load();
    showToast(t("planner.refreshed"), "success", 3000);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    refreshing.value = false;
  }
}

async function manualSearch() {
  searching.value = true;
  try {
    await searchSubscription(id, { kind: "missing" });
    showToast(t("planner.searchQueued"), "success", 3000);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    searching.value = false;
  }
}

async function toggleMonitored(v: boolean) {
  try {
    await updateSubscription(id, { monitored: v ? 1 : 0 });
    sub.value.monitored = v ? 1 : 0;
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  }
}

async function confirmDelete() {
  try {
    await deleteSubscription(id);
    showToast(t("planner.deleted"), "success", 3000);
    navigateTo("/planner/series");
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  }
}

async function toggleSeasonMonitored(season: any, v: boolean) {
  for (const ep of season.episodes ?? []) {
    await updateEpisode(id, ep.id, { monitored: v ? 1 : 0 }).catch(() => {});
  }
  season.monitored = v ? 1 : 0;
}

async function toggleEpisodeMonitored(ep: any, v: boolean) {
  try {
    await updateEpisode(id, ep.id, { monitored: v ? 1 : 0 });
    ep.monitored = v ? 1 : 0;
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  }
}

async function downloadSeasonNow(season: any) {
  downloadingSeasonId.value = season.id;
  try {
    await downloadSeason(id, season.id);
    showToast(t("planner.seasonDownloadQueued"), "success", 3000);
    // Los grabs se encolan en background; refrescamos para ver los estados.
    setTimeout(load, 1500);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    downloadingSeasonId.value = null;
  }
}

function openEpisodeSearch(ep: any) {
  downloadTarget.value = ep;
  showDownloadDialog.value = true;
}

function onGrabbed() {
  load();
}

onMounted(load);
</script>

<style scoped>
.planner-card-fallback {
  background: var(--s-bg-hover, #1a1a30);
  color: var(--s-text-muted, #999);
  min-height: 200px;
}
/* Alinear el h2 del título con los tags (Plex / Monitorizada) */
.level-left {
  display: flex;
  align-items: center;
}
.level-left .title {
  line-height: 1;
}
.planner-folder-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.planner-folder-input {
  flex: 1;
  min-width: 0;
}
.planner-post-tasks {
  border-top: 1px solid var(--s-border, #2a2a4a);
  padding-top: 12px;
  margin: 6px 0 2px;
}
.planner-post-tasks-title {
  margin: 0 0 10px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--s-text-secondary, #999);
}
.planner-post-tasks-body {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.planner-delete-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.plex-tag {
  background: rgba(212, 175, 55, 0.16);
  color: #d4af37;
  border-color: #d4af37;
  font-weight: 600;
}
@media (max-width: 768px) {
  .detail-columns {
    flex-direction: column;
  }
  .detail-columns > .column {
    width: 100%;
    flex: none;
  }
}
</style>
