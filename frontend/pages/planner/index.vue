<template>
  <SLoading id="page-planner" :loading="loading">
    <div class="py-4">
      <h2 class="title is-4 mb-4">
        <span class="mdi mdi-calendar-clock mr-2" />{{ $t("planner.title") }}
      </h2>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <!-- Stats cards -->
      <div class="columns mb-4">
        <div class="column is-3">
          <NuxtLink :to="'/planner/series'" class="stats-link">
            <div class="box has-text-centered">
              <p class="is-size-1">{{ counts.series }}</p>
              <p class="has-text-grey">{{ $t("planner.series") }}</p>
            </div>
          </NuxtLink>
        </div>
        <div class="column is-3">
          <NuxtLink :to="'/planner/movies'" class="stats-link">
            <div class="box has-text-centered">
              <p class="is-size-1">{{ counts.movies }}</p>
              <p class="has-text-grey">{{ $t("planner.movies") }}</p>
            </div>
          </NuxtLink>
        </div>
        <div class="column is-3">
          <NuxtLink :to="'/planner/wanted'" class="stats-link">
            <div class="box has-text-centered">
              <p class="is-size-1">{{ counts.wanted }}</p>
              <p class="has-text-grey">{{ $t("planner.wanted") }}</p>
            </div>
          </NuxtLink>
        </div>
        <div class="column is-3">
          <div class="box has-text-centered">
            <p class="is-size-1">{{ counts.grabbed }}</p>
            <p class="has-text-grey">{{ $t("planner.grabbed") }}</p>
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="columns mb-4">
        <div class="column">
          <SButton variant="primary" icon="mdi-television-play" @click="navigateTo('/planner/series')">
            {{ $t("planner.series") }}
          </SButton>
          <SButton variant="primary" icon="mdi-movie-open" @click="navigateTo('/planner/movies')" class="ml-2">
            {{ $t("planner.movies") }}
          </SButton>
          <SButton variant="default" icon="mdi-calendar-month-outline" @click="navigateTo('/planner/calendar')" class="ml-2">
            {{ $t("planner.calendar") }}
          </SButton>
          <SButton variant="default" icon="mdi-download-multiple" @click="navigateTo('/planner/wanted')" class="ml-2">
            {{ $t("planner.wanted") }}
          </SButton>
          <SButton variant="primary" icon="mdi-plus" @click="showAddSeries = true" class="ml-4">
            {{ $t("planner.addSeries") }}
          </SButton>
          <SButton variant="primary" icon="mdi-plus" @click="showAddMovie = true" class="ml-2">
            {{ $t("planner.addMovie") }}
          </SButton>
        </div>
      </div>

      <!-- Upcoming episodes (next 30 days) -->
      <h3 class="title is-5 mt-4">
        <span class="mdi mdi-calendar-month-outline mr-2" />{{ $t("planner.upcoming") }}
      </h3>
      <div v-if="upcoming.length === 0" class="box has-text-centered">
        <p><span class="mdi mdi-calendar-blank-outline is-size-2 has-text-grey-light" /></p>
        <p class="has-text-grey">{{ $t("planner.noUpcoming") }}</p>
      </div>
      <STable
        v-else
        :data="upcoming"
        :columns="upcomingColumns"
        row-key="id"
        :stripe="true"
      >
        <template #cell-air_date="{ row }">
          <span class="has-text-weight-medium">{{ formatDate(row.air_date) }}</span>
        </template>
        <template #cell-subscription_id="{ row }">
          <NuxtLink :to="`/planner/series/${row.subscription_id}`" class="planner-link">
            {{ titleFor(row.subscription_id) }}
          </NuxtLink>
        </template>
        <template #cell-episode="{ row }">
          <STag variant="info">S{{ pad(row.season_number) }}E{{ pad(row.episode_number) }}</STag>
        </template>
        <template #cell-status="{ row }">
          <STag :variant="statusClass(row.status)">
            {{ statusLabel(row.status) }}
          </STag>
        </template>
      </STable>
    </div>

    <!-- Modales añadir -->
    <PlannerAddMediaDialog
      v-model="showAddSeries"
      media-type="series"
      @added="onAddedSeries"
    />
    <PlannerAddMediaDialog
      v-model="showAddMovie"
      media-type="movie"
      @added="onAddedMovie"
    />
  </SLoading>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { listSubscriptions } = usePlanner();
const { apiFetch } = useApi();

const loading = ref(true);
const errorMsg = ref("");
const series = ref<Awaited<ReturnType<typeof listSubscriptions>>>([]);
const movies = ref<Awaited<ReturnType<typeof listSubscriptions>>>([]);
const upcoming = ref<any[]>([]);
const showAddSeries = ref(false);
const showAddMovie = ref(false);

const counts = reactive({ series: 0, movies: 0, wanted: 0, grabbed: 0 });

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString();
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function titleFor(subId: number): string {
  return series.value.find((s) => s.id === subId)?.title ?? movies.value.find((m) => m.id === subId)?.title ?? `#${subId}`;
}
const upcomingColumns = [
  { prop: "air_date", label: "Fecha", width: "110px" },
  { prop: "subscription_id", label: "Serie" },
  { prop: "episode", label: "Episodio", width: "110px" },
  { prop: "status", label: "Estado", width: "130px" },
];
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

function onAddedSeries(subId: number) {
  showAddSeries.value = false;
  navigateTo(`/planner/series/${subId}`);
}
function onAddedMovie(subId: number) {
  showAddMovie.value = false;
  navigateTo(`/planner/movies/${subId}`);
}

onMounted(async () => {
  try {
    const [s, m] = await Promise.all([
      listSubscriptions({ type: "series" }),
      listSubscriptions({ type: "movie" }),
    ]);
    series.value = s;
    movies.value = m;
    counts.series = s.length;
    counts.movies = m.length;

    // Episodios próximos: consultar cada serie con episodes
    const today = new Date().toISOString().slice(0, 10);
    const maxDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const all: any[] = [];
    for (const sub of s.slice(0, 10)) {
      const detail = await apiFetch<any>(`/api/planner/subscriptions/${sub.id}`);
      for (const season of detail.seasons ?? []) {
        for (const ep of season.episodes ?? []) {
          if (ep.air_date && ep.air_date >= today && ep.air_date <= maxDate) {
            all.push({ ...ep, subscription_id: sub.id });
          }
        }
      }
    }
    all.sort((a, b) => (a.air_date < b.air_date ? -1 : 1));
    upcoming.value = all.slice(0, 20);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.stats-link {
  display: block;
  color: inherit;
}
.stats-link:hover .box {
  border-color: var(--s-accent, #00d4ff);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.planner-link {
  color: var(--s-accent, #00d4ff);
  font-weight: 500;
}
.planner-link:hover {
  text-decoration: underline;
}
</style>
