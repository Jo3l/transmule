<template>
  <SLoading id="page-planner-series-detail" :loading="loading">
    <div v-if="sub" class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">{{ sub.title }}</h2>
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
          <figure class="image is-2by3 mb-3">
            <img v-if="sub.poster_url" :src="sub.poster_url" :alt="sub.title" />
            <div v-else class="planner-card-fallback is-flex is-align-items-center is-justify-content-center">
              <span class="mdi mdi-television-play is-size-1" />
            </div>
          </figure>
          <p class="has-text-grey is-size-7">{{ sub.overview }}</p>
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
        :subscription-id="id"
        :episode-id="downloadTarget?.id ?? null"
        @grabbed="onGrabbed"
      />
    </div>
  </SLoading>
</template>

<script setup lang="ts">
import { usePlannerStatusDisplay, padEpisode, formatPlannerDate } from "~/composables/usePlannerUi";

const route = useRoute();
const { t } = useI18n();
const { getSubscription, deleteSubscription, searchSubscription, refreshSubscription, updateSubscription, updateEpisode, downloadSeason } = usePlanner();
const { statusLabel, statusClass } = usePlannerStatusDisplay();
const { showToast } = useApi();

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

const episodeColumns = computed(() => [
  { prop: "number", label: "#", width: "60px" },
  { prop: "title", label: t("planner.episodeTitle") },
  { prop: "air_date", label: t("planner.airDate"), width: "130px" },
  { prop: "status", label: t("planner.status"), width: "130px" },
  { prop: "actions", label: "", width: "110px" },
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

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const detail = await getSubscription(id);
    sub.value = detail;
    seasons.value = detail.seasons ?? [];
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
.planner-delete-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
