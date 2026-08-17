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
              </div>
            </div>

            <STable
              :data="season.episodes ?? []"
              :columns="episodeColumns"
              row-key="id"
              :pagination="false"
              :bordered="false"
            >
              <template #cell-number="{ row }">
                <span class="has-text-weight-medium">{{ pad(row.episode_number) }}</span>
              </template>
              <template #cell-title="{ row }">
                {{ row.title ?? "—" }}
              </template>
              <template #cell-air_date="{ row }">
                {{ row.air_date ?? "—" }}
              </template>
              <template #cell-status="{ row }">
                <STag :variant="statusClass(row.status)">
                  {{ statusLabel(row.status) }}
                </STag>
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
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const { getSubscription, deleteSubscription, searchSubscription, refreshSubscription, updateSubscription, updateEpisode } = usePlanner();
const { showToast } = useApi();

const id = Number(route.params.id);
const loading = ref(true);
const errorMsg = ref("");
const sub = ref<any>(null);
const seasons = ref<any[]>([]);
const refreshing = ref(false);
const searching = ref(false);
const showDeleteModal = ref(false);

const episodeColumns = [
  { prop: "number", label: "#", width: "60px" },
  { prop: "title", label: "Episodio" },
  { prop: "air_date", label: "Emisión" },
  { prop: "status", label: "Estado", width: "130px" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function downloadedCount(season: any): number {
  return (season.episodes ?? []).filter((e: any) => e.status === "downloaded").length;
}
const STATUS_LABELS: Record<string, string> = {
  unreleased: "planner.statusUnreleased",
  wanted: "planner.statusWanted",
  grabbed: "planner.statusGrabbed",
  downloaded: "planner.statusDownloaded",
  cutoff_unmet: "planner.statusCutoff",
  failed: "planner.statusFailed",
};
function statusLabel(s: string): string {
  return t(STATUS_LABELS[s] ?? "planner.statusUnknown");
}
function statusClass(s: string): "default" | "success" | "warning" | "danger" | "info" {
  if (s === "wanted") return "warning";
  if (s === "grabbed") return "info";
  if (s === "downloaded") return "success";
  if (s === "failed") return "danger";
  return "default";
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