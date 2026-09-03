<template>
  <SLoading id="page-planner" :loading="loading">
    <div class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">
            <span class="mdi mdi-calendar-clock mr-2" />{{ $t("planner.title") }}
          </h2>
        </div>
        <div class="level-right">
          <div class="is-flex is-align-items-center">
            <span class="is-size-7 has-text-grey mr-2">{{ $t("planner.language") }}</span>
            <SSelect
              v-model="selectedLang"
              :options="langOptions"
              style="min-width: 200px"
              @update:model-value="onLangChange"
            />
          </div>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <!-- Acciones rápidas -->
      <div class="mb-4">
        <SButton variant="primary" icon="mdi-plus" @click="showAddSeries = true">
          {{ $t("planner.addSeries") }}
        </SButton>
        <SButton variant="primary" icon="mdi-plus" @click="showAddMovie = true" class="ml-2">
          {{ $t("planner.addMovie") }}
        </SButton>
        <SButton variant="default" icon="mdi-calendar-month-outline" @click="navigateTo('/planner/calendar')" class="ml-2">
          {{ $t("planner.calendar") }}
        </SButton>
      </div>

      <!-- Series populares -->
      <section class="mb-5">
        <div class="planner-section-head">
          <h3 class="title is-5 mb-0">
            <span class="mdi mdi-television-play mr-2" />{{ $t("planner.popularSeries") }}
          </h3>
          <span v-if="popularLoading" class="mdi mdi-loading mdi-spin has-text-grey" />
        </div>
        <PlannerPosterSlider
          v-if="popularSeries.length"
          :items="popularSeries"
          media-type="series"
          @select="onSelectSeries"
        />
        <div v-else-if="!popularLoading" class="box has-text-centered">
          <p class="has-text-grey is-size-7">{{ $t("planner.popularEmpty") }}</p>
        </div>
      </section>

      <!-- Películas populares -->
      <section class="mb-5">
        <div class="planner-section-head">
          <h3 class="title is-5 mb-0">
            <span class="mdi mdi-movie-open mr-2" />{{ $t("planner.popularMovies") }}
          </h3>
        </div>
        <PlannerPosterSlider
          v-if="popularMovies.length"
          :items="popularMovies"
          media-type="movie"
          @select="onSelectMovie"
        />
        <div v-else-if="!popularLoading" class="box has-text-centered">
          <p class="has-text-grey is-size-7">{{ $t("planner.popularEmpty") }}</p>
        </div>
      </section>

      <!-- Próximos episodios (próximos 30 días) -->
      <section>
        <h3 class="title is-5 mb-3">
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
            <STag variant="info">S{{ padEpisode(row.season_number) }}E{{ padEpisode(row.episode_number) }}</STag>
          </template>
          <template #cell-status="{ row }">
            <STag :variant="statusClass(row.status)">
              {{ statusLabel(row.status) }}
            </STag>
          </template>
        </STable>
      </section>
    </div>

    <!-- Modales añadir -->
    <PlannerAddMediaDialog
      v-model="showAddSeries"
      media-type="series"
      :initial-result="addInitialSeries"
      @added="onAddedSeries"
    />
    <PlannerAddMediaDialog
      v-model="showAddMovie"
      media-type="movie"
      :initial-result="addInitialMovie"
      @added="onAddedMovie"
    />
  </SLoading>
</template>

<script setup lang="ts">
import { usePlannerStatusDisplay, padEpisode, formatPlannerDate } from "~/composables/usePlannerUi";
import type { TmdbPopularItem } from "~/composables/usePlanner";

const { t } = useI18n();
const { listSubscriptions, discoverPopular, getPlannerStatus } = usePlanner();
const { statusLabel, statusClass } = usePlannerStatusDisplay();
const { apiFetch } = useApi();

const loading = ref(true);
const errorMsg = ref("");
const series = ref<Awaited<ReturnType<typeof listSubscriptions>>>([]);
const movies = ref<Awaited<ReturnType<typeof listSubscriptions>>>([]);
const upcoming = ref<any[]>([]);
const showAddSeries = ref(false);
const showAddMovie = ref(false);
const addInitialSeries = ref<any>(null);
const addInitialMovie = ref<any>(null);

// ── Sliders de populares ─────────────────────────────────────────────────────
const popularSeries = ref<TmdbPopularItem[]>([]);
const popularMovies = ref<TmdbPopularItem[]>([]);
const popularLoading = ref(false);

// ── Idioma (localización de títulos) ─────────────────────────────────────────
const LANG_STORAGE_KEY = "planner.lang";
const PLANNER_LANGUAGES = [
  { code: "es", name: "Español" },
  { code: "en", name: "English" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
];
const selectedLang = ref("");
const defaultLocale = ref("");

const langOptions = computed(() => {
  const suffix = defaultLocale.value ? ` (${defaultLocale.value})` : "";
  return [
    { label: t("planner.languageDefault") + suffix, value: "" },
    ...PLANNER_LANGUAGES.map((l) => ({ label: l.name, value: l.code })),
  ];
});

function onLangChange(v: string | number) {
  selectedLang.value = String(v);
  localStorage.setItem(LANG_STORAGE_KEY, selectedLang.value);
  loadPopular();
}

async function loadPopular() {
  popularLoading.value = true;
  try {
    const res = await discoverPopular({
      language: selectedLang.value || undefined,
      limit: 14,
    });
    popularSeries.value = res.series;
    popularMovies.value = res.movies;
  } catch {
    popularSeries.value = [];
    popularMovies.value = [];
  } finally {
    popularLoading.value = false;
  }
}

/** Convierte un título popular de TMDB al shape de initialResult del modal. */
function toInitialResult(item: TmdbPopularItem): any {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    poster_url: item.poster_url,
    overview: item.overview,
    vote_average: item.vote_average,
    source: "tmdb",
  };
}

function onSelectSeries(item: TmdbPopularItem) {
  addInitialSeries.value = toInitialResult(item);
  showAddSeries.value = true;
}
function onSelectMovie(item: TmdbPopularItem) {
  addInitialMovie.value = toInitialResult(item);
  showAddMovie.value = true;
}

function formatDate(d: string | null): string {
  return formatPlannerDate(d);
}
function titleFor(subId: number): string {
  return series.value.find((s) => s.id === subId)?.title ?? movies.value.find((m) => m.id === subId)?.title ?? `#${subId}`;
}
const upcomingColumns = computed(() => [
  { prop: "air_date", label: t("planner.date"), width: "110px" },
  { prop: "subscription_id", label: t("planner.show") },
  { prop: "episode", label: t("planner.episode"), width: "110px" },
  { prop: "status", label: t("planner.status"), width: "130px" },
]);
function onAddedSeries(subId: number) {
  showAddSeries.value = false;
  addInitialSeries.value = null;
  navigateTo(`/planner/series/${subId}`);
}
function onAddedMovie(subId: number) {
  showAddMovie.value = false;
  addInitialMovie.value = null;
  navigateTo(`/planner/movies/${subId}`);
}

onMounted(async () => {
  selectedLang.value = localStorage.getItem(LANG_STORAGE_KEY) ?? "";

  // Sliders + estado (para el idioma por defecto) en paralelo con el resto.
  loadPopular();
  getPlannerStatus()
    .then((s) => {
      defaultLocale.value = s?.tmdbLocale ?? "";
    })
    .catch(() => {});

  try {
    const [s, m] = await Promise.all([
      listSubscriptions({ type: "series" }),
      listSubscriptions({ type: "movie" }),
    ]);
    series.value = s;
    movies.value = m;

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
.planner-link {
  color: var(--s-accent, #00d4ff);
  font-weight: 500;
}
.planner-link:hover {
  text-decoration: underline;
}
.planner-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
</style>
