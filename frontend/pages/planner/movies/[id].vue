<template>
  <SLoading id="page-planner-movie-detail" :loading="loading">
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
        <div class="column is-3">
          <div class="box mb-3">
            <figure class="image is-2by3 mb-3">
              <img v-if="sub.poster_url" :src="sub.poster_url" :alt="sub.title" />
              <div v-else class="planner-card-fallback is-flex is-align-items-center is-justify-content-center">
                <span class="mdi mdi-movie-open is-size-1" />
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
            <div class="flex-end gap-sm mt-3">
              <SButton variant="primary" icon="mdi-content-save" :loading="savingCfg" @click="saveConfig">
                {{ $t("planner.save") }}
              </SButton>
            </div>
          </div>
        </div>
        <div class="column">
          <div class="box mt-4">
            <div class="level mb-0">
              <div class="level-left">
                <h4 class="title is-6 mb-0">{{ $t("planner.status") }}</h4>
              </div>
              <div class="level-right">
                <STag :variant="statusClass(movie?.status)">
                  {{ statusLabel(movie?.status) }}
                </STag>
              </div>
            </div>
            <div v-if="movie?.digital_release_date" class="mt-3 is-size-7 has-text-grey">
              <span class="mdi mdi-calendar-clock mr-1" />
              {{ $t("planner.digitalRelease") }}:
              <strong>{{ formatDate(movie.digital_release_date) }}</strong>
            </div>
            <div v-if="movie?.theatrical_release_date" class="mt-2 is-size-7 has-text-grey">
              <span class="mdi mdi-calendar-star mr-1" />
              {{ $t("planner.theatricalRelease") }}:
              <strong>{{ formatDate(movie.theatrical_release_date) }}</strong>
            </div>
            <div v-if="movie?.downloaded_quality" class="mt-2 is-size-7">
              <span class="mdi mdi-check-circle text-success mr-1" />
              {{ $t("planner.downloadedQuality") }}:
              <strong>{{ movie.downloaded_quality }}</strong>
            </div>
            <div v-if="canDownload" class="mt-3">
              <SButton
                variant="primary"
                icon="mdi-download"
                @click="openSearch"
              >
                {{ $t("planner.download") }}
              </SButton>
            </div>
          </div>

          <div class="box">
            <h4 class="title is-6 mb-1">{{ $t("planner.searchHistory") }}</h4>
            <p class="has-text-grey is-size-7 mb-3">{{ $t("planner.searchHistoryHint") }}</p>
            <div v-if="history.length === 0" class="has-text-grey is-size-7">
              {{ $t("planner.noHistory") }}
            </div>
            <STable
              v-else
              :data="history"
              :columns="historyColumns"
              row-key="id"
              :pagination="false"
              :bordered="false"
            >
              <template #cell-picked_at="{ row }">
                {{ (row.picked_at ?? "").slice(0, 16) }}
              </template>
              <template #cell-search_kind="{ row }">
                <STag>{{ row.search_kind }}</STag>
              </template>
              <template #cell-status="{ row }">
                <STag :variant="historyStatusClass(row.status)">
                  {{ row.status }}
                </STag>
              </template>
              <template #cell-picked_title="{ row }">
                <span :title="row.picked_title">{{ row.picked_title ?? "—" }}</span>
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

      <!-- Búsqueda interactiva (elegir release) -->
      <PlannerSearchDialog
        v-model="showSearchDialog"
        media-type="movie"
        :title="sub.title"
        :year="sub.year ?? undefined"
        :subscription-id="id"
        :movie-id="movie?.id ?? null"
        @grabbed="onGrabbed"
      />

      <!-- Selector de carpeta de destino (mismo componente que el file manager) -->
      <SDialog v-model="showFolderPicker" :title="$t('planner.chooseFolder')" width="480px">
        <FolderPicker v-model="pickerPath" :key="'fp-detail-' + showFolderPicker" />
        <template #footer>
          <div class="flex-end gap-sm">
            <SButton @click="showFolderPicker = false">{{ $t("planner.cancel") }}</SButton>
            <SButton variant="primary" @click="confirmFolder">
              {{ $t("planner.useFolder") }}
            </SButton>
          </div>
        </template>
      </SDialog>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
import { usePlannerStatusDisplay, formatPlannerDate } from "~/composables/usePlannerUi";

const route = useRoute();
const { t } = useI18n();
const { getSubscription, deleteSubscription, searchSubscription, refreshSubscription, getSubscriptionHistory, updateSubscription } = usePlanner();
const { statusLabel, statusClass } = usePlannerStatusDisplay();
const { apiFetch, showToast } = useApi();

const id = Number(route.params.id);
const loading = ref(true);
const errorMsg = ref("");
const sub = ref<any>(null);
const movie = ref<any>(null);
const history = ref<any[]>([]);
const refreshing = ref(false);
const searching = ref(false);
const showDeleteModal = ref(false);
const showSearchDialog = ref(false);
const plexTag = ref(false);

// ── Configuración editable (misma que se introduce al añadir) ───────────────
const cfgMinQuality = ref<string>("fullhd");
const cfgMaxSize = ref<string>(""); // "" = sin límite
const cfgRootFolder = ref("downloads");
const cfgSmartRename = ref(false);
const cfgPlexScan = ref(false);
const savingCfg = ref(false);

// Selector de carpeta de destino (mismo patrón que el add flow)
const showFolderPicker = ref(false);
const pickerPath = ref("");

function openFolderPicker() {
  let cur = cfgRootFolder.value.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!cur || cur === "home" || cur === "downloads") cur = "home";
  else cur = cur.replace(/^downloads\//, "home/");
  pickerPath.value = cur;
  showFolderPicker.value = true;
}

function confirmFolder() {
  let p = pickerPath.value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p || p === "home" || p === "downloads") p = "downloads";
  else if (p.startsWith("home/")) p = "downloads/" + p.slice(5);
  cfgRootFolder.value = p;
  showFolderPicker.value = false;
}

function loadConfig() {
  const s = sub.value;
  if (!s) return;
  cfgMinQuality.value = s.min_quality ?? "fullhd";
  cfgMaxSize.value = s.max_size_mb ? String(s.max_size_mb) : "";
  cfgRootFolder.value = s.root_folder || "downloads";
  cfgSmartRename.value = Boolean(s.smart_rename);
  cfgPlexScan.value = Boolean(s.plex_scan);
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
    });
    const s = sub.value;
    s.min_quality = cfgMinQuality.value;
    s.max_size_mb = cfgMaxSize.value ? Number(cfgMaxSize.value) : null;
    s.root_folder = cfgRootFolder.value;
    s.smart_rename = cfgSmartRename.value ? 1 : 0;
    s.plex_scan = cfgPlexScan.value ? 1 : 0;
    showToast(t("planner.configSaved"), "success", 3000);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    savingCfg.value = false;
  }
}

/** ¿Se puede descargar? Película estrenada (emitida) o reintento tras fallo. */
const canDownload = computed(() => {
  const s = movie.value?.status;
  return s === "released" || s === "waiting" || s === "failed";
});

const historyColumns = computed(() => [
  { prop: "picked_at", label: t("planner.date") },
  { prop: "search_kind", label: t("planner.searchKind"), width: "100px" },
  { prop: "status", label: t("planner.status"), width: "120px" },
  { prop: "picked_title", label: t("planner.picked") },
]);

function historyStatusClass(s: string): "default" | "success" | "warning" | "danger" {
  if (s === "grabbed") return "success";
  if (s === "no_results") return "warning";
  if (s === "failed") return "danger";
  return "default";
}
function formatDate(d: string | null): string {
  return formatPlannerDate(d);
}

/** ¿La película ya existe en Plex? → tag dorado [plex]. */
async function checkPlexTag() {
  const title = sub.value?.title ?? "";
  const target = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!target) return;
  try {
    const res = await apiFetch<{ configured: boolean; movies: string[] }>(
      "/api/plex/library",
    );
    if (!res?.configured) return;
    const list = res.movies ?? [];
    // Igualdad normalizada; si no, "contains" (títulos tipo "01 Alien El 8º
    // Pasajero 1979" incluyen el nombre canónico) con longitud mínima.
    plexTag.value =
      list.includes(target) ||
      (target.length >= 4 && list.some((t) => t.includes(target)));
  } catch {
    /* Plex caído o sin configurar → sin tag */
  }
}

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const detail = await getSubscription(id);
    sub.value = detail;
    movie.value = detail.movie ?? null;
    history.value = await getSubscriptionHistory(id);
    loadConfig();
    void checkPlexTag();
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
    await load();
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    searching.value = false;
  }
}

/** Abre la búsqueda interactiva (el usuario elige el release). */
function openSearch() {
  showSearchDialog.value = true;
}

/** Tras descargar un release desde el diálogo. */
function onGrabbed() {
  load();
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
    navigateTo("/planner/movies");
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  }
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