<template>
  <SLoading id="page-planner-movie-detail" :loading="loading">
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
        <div class="column is-3">
          <figure class="image is-2by3 mb-3">
            <img v-if="sub.poster_url" :src="sub.poster_url" :alt="sub.title" />
            <div v-else class="planner-card-fallback is-flex is-align-items-center is-justify-content-center">
              <span class="mdi mdi-movie-open is-size-1" />
            </div>
          </figure>
        </div>
        <div class="column">
          <p class="has-text-grey">{{ sub.overview }}</p>

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
    </div>
  </SLoading>
</template>

<script setup lang="ts">
import { usePlannerStatusDisplay, formatPlannerDate } from "~/composables/usePlannerUi";

const route = useRoute();
const { t } = useI18n();
const { getSubscription, deleteSubscription, searchSubscription, refreshSubscription, getSubscriptionHistory, updateSubscription } = usePlanner();
const { statusLabel, statusClass } = usePlannerStatusDisplay();
const { showToast } = useApi();

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

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const detail = await getSubscription(id);
    sub.value = detail;
    movie.value = detail.movie ?? null;
    history.value = await getSubscriptionHistory(id);
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