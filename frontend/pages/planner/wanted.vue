<template>
  <SLoading id="page-planner-wanted" :loading="loading">
    <div class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">
            <span class="mdi mdi-download-multiple mr-2" />{{ $t("planner.wanted") }}
          </h2>
        </div>
        <div class="level-right">
          <SSelect v-model="filterType" class="mr-3" @update:model-value="load">
            <option value="missing">{{ $t("planner.wantedMissing") }}</option>
            <option value="cutoff_unmet">{{ $t("planner.wantedCutoff") }}</option>
          </SSelect>
          <SButton
            variant="primary"
            icon="mdi-download-multiple"
            :loading="searching"
            @click="runAutoDownload"
          >
            {{ $t("planner.autoDownload") }}
          </SButton>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <div v-if="items.length === 0 && !loading" class="box has-text-centered">
        <p><span class="mdi mdi-check-all is-size-2 has-text-grey-light" /></p>
        <p class="has-text-grey">{{ $t("planner.noWanted") }}</p>
      </div>

      <STable
        v-else
        :data="items"
        :columns="columns"
        row-key="id"
        :stripe="true"
      >
        <template #cell-subscription_title="{ row }">
          <NuxtLink :to="`/planner/series/${row.subscription_id}`" class="planner-link">
            {{ row.subscription_title ?? `#${row.subscription_id}` }}
          </NuxtLink>
        </template>
        <template #cell-episode="{ row }">
          <STag variant="info">S{{ padEpisode(row.season_number) }}E{{ padEpisode(row.episode_number) }}</STag>
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
        <template #cell-actions="{ row }">
          <SButton
            size="sm"
            variant="primary"
            icon="mdi-magnify"
            @click="openSearch(row)"
          >
            {{ $t("planner.search") }}
          </SButton>
        </template>
      </STable>
    </div>

    <PlannerSearchDialog
      v-model="showSearchDialog"
      media-type="series"
      :title="searchTarget?.subscription_title ?? ''"
      :season="searchTarget?.season_number ?? 0"
      :episode="searchTarget?.episode_number ?? 0"
      :subscription-id="searchTarget?.subscription_id ?? 0"
      :episode-id="searchTarget?.id ?? null"
      @grabbed="onGrabbed"
    />
  </SLoading>
</template>

<script setup lang="ts">
import { padEpisode } from "~/composables/usePlannerUi";

const { t } = useI18n();
const { autoDownload } = usePlanner();
const { apiFetch } = useApi();
const { showToast } = useApi();

const loading = ref(true);
const errorMsg = ref("");
const items = ref<any[]>([]);
const searching = ref(false);
const filterType = ref("missing");
const showSearchDialog = ref(false);
const searchTarget = ref<any>(null);

const columns = computed(() => [
  { prop: "subscription_title", label: t("planner.show") },
  { prop: "episode", label: t("planner.episode"), width: "110px" },
  { prop: "title", label: t("planner.episodeTitle") },
  { prop: "air_date", label: t("planner.airDate"), width: "110px" },
  { prop: "status", label: t("planner.status"), width: "230px" },
  { prop: "actions", label: "", width: "100px" },
]);

function statusLabel(s: string): string {
  return t(s === "cutoff_unmet" ? "planner.statusCutoff" : "planner.statusReleased");
}
function statusClass(s: string): "warning" | "info" | "default" {
  return s === "cutoff_unmet" ? "info" : "default";
}

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const res = await apiFetch<{ episodes: any[] }>(
      `/api/planner/wanted?type=${filterType.value}`,
    );
    items.value = res.episodes;
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    loading.value = false;
  }
}

function openSearch(ep: any) {
  searchTarget.value = ep;
  showSearchDialog.value = true;
}

function onGrabbed() {
  load();
}

async function runAutoDownload() {
  searching.value = true;
  errorMsg.value = "";
  try {
    await autoDownload();
    showToast(t("planner.autoDownloadStarted"), "success", 3000);
    await load();
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    searching.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.planner-link {
  color: var(--s-accent, #00d4ff);
  font-weight: 500;
}
.planner-link:hover {
  text-decoration: underline;
}
</style>