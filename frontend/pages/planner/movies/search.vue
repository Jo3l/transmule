<template>
  <SLoading id="page-planner-movies-search" :loading="isSearching">
    <div class="py-4 planner-search">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0 ml-3">
            <span class="mdi mdi-movie-open mr-2" />{{ $t("planner.addMovie") }}
          </h2>
        </div>
      </div>

      <!-- Búsqueda (estilo MediaManager: input + Enter + botón) -->
      <div class="planner-search-bar mb-2">
        <SInput
          v-model="query"
          size="lg"
          :placeholder="$t('planner.searchPlaceholder')"
          @keyup.enter="doSearch"
        >
          <template #prefix>
            <span class="mdi mdi-magnify" />
          </template>
        </SInput>
        <SButton variant="primary" size="lg" :loading="isSearching" @click="doSearch">
          {{ $t("planner.search") }}
        </SButton>
      </div>
      <p class="has-text-grey is-size-7 mb-3">{{ $t("planner.searchHint") }}</p>

      <!-- Advanced Settings (colapsable, como MediaManager) -->
      <div class="planner-advanced mb-4">
        <button class="planner-advanced-toggle" @click="showAdvanced = !showAdvanced">
          <span class="mdi" :class="showAdvanced ? 'mdi-chevron-down' : 'mdi-chevron-right'" />
          {{ $t("planner.advancedSettings") }}
        </button>
        <div v-show="showAdvanced" class="planner-advanced-body">
          <SFormItem :label="$t('planner.metadataProvider')">
            <SSelect v-model="metadataProvider">
              <option value="tmdb">TMDB</option>
              <option value="tvdb">TVDB</option>
            </SSelect>
          </SFormItem>
          <SFormItem :label="$t('planner.minQuality')">
            <SSelect v-model="minQuality">
              <option value="uhd">4K (Ultra HD)</option>
              <option value="fullhd">1080p (Full HD)</option>
              <option value="hd">720p (HD)</option>
              <option value="sd">480p (SD)</option>
            </SSelect>
          </SFormItem>
          <SFormItem :label="$t('planner.rootFolder')">
            <SInput v-model="rootFolder" />
          </SFormItem>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <!-- Empty / hint -->
      <div v-if="results.length === 0 && !isSearching" class="box has-text-centered">
        <p><span class="mdi mdi-movie-open-outline is-size-2 has-text-grey-light" /></p>
        <p class="has-text-grey">{{ $t("planner.searchEmpty") }}</p>
      </div>

      <!-- Grid resultados (cards con Add directo) -->
      <div v-else class="columns is-multiline">
        <div
          v-for="r in results"
          :key="`${r.id}-${r.title}`"
          class="column"
        >
          <div class="planner-card">
            <div>
              <figure class="image is-2by3">
                <img v-if="r.poster_url" :src="r.poster_url" :alt="r.title" loading="lazy" />
                <div v-else class="planner-card-fallback">
                  <span class="mdi mdi-movie-open is-size-1" />
                </div>
              </figure>
            </div>
            <div>
              <p class="title is-6 mb-1">
                {{ r.title }}
                <span v-if="r.release_date" class="has-text-grey-light is-size-7">
                  ({{ r.release_date.slice(0, 4) }})
                </span>
              </p>
              <p class="subtitle is-7 mb-2 has-text-grey planner-overview">
                {{ r.overview || $t("planner.noOverview") }}
              </p>
              <div v-if="r.vote_average" class="mb-2 is-size-7 has-text-warning">
                ★ {{ r.vote_average.toFixed(1) }}/10
              </div>
              <div class="planner-card-actions">
                <SButton
                  v-if="!isAdded(r)"
                  variant="primary"
                  size="sm"
                  icon="mdi-plus"
                  block
                  :loading="addingId === r.id"
                  @click="addMedia(r)"
                >
                  {{ $t("planner.add") }}
                </SButton>
                <SButton
                  v-else
                  variant="success"
                  size="sm"
                  icon="mdi-check"
                  block
                  @click="navigateTo(`/planner/movies/${existingId(r)}`)"
                >
                  {{ $t("planner.addedAlready") }}
                </SButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
import type { TmdbSearchResult } from "~/composables/usePlanner";

const { t } = useI18n();
const { searchTmdb, createSubscription, refreshSubscription, listSubscriptions } = usePlanner();
const { showToast } = useApi();

const query = ref("");
const isSearching = ref(false);
const errorMsg = ref("");
const results = ref<TmdbSearchResult[]>([]);

const showAdvanced = ref(false);
const metadataProvider = ref("tmdb");
const minQuality = ref("fullhd");
const rootFolder = ref("/downloads");

const addingId = ref<number | null>(null);
const existing = ref<Map<number, number>>(new Map()); // tmdbId → subId

/** Cargar suscripciones existentes para marcar "already added". */
async function loadExisting() {
  try {
    const subs = await listSubscriptions({ type: "movie" });
    const m = new Map<number, number>();
    for (const s of subs) {
      if (s.tmdb_id) m.set(s.tmdb_id, s.id);
    }
    existing.value = m;
  } catch {
    // silencioso
  }
}

function isAdded(r: TmdbSearchResult): boolean {
  return existing.value.has(r.id);
}
function existingId(r: TmdbSearchResult): number {
  return existing.value.get(r.id) ?? 0;
}

async function doSearch() {
  const q = query.value.trim();
  if (!q) return;
  isSearching.value = true;
  errorMsg.value = "";
  try {
    results.value = await searchTmdb(q, { type: "movie" });
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    isSearching.value = false;
  }
}

async function addMedia(r: TmdbSearchResult) {
  addingId.value = r.id;
  errorMsg.value = "";
  try {
    const sub = await createSubscription({
      type: "movie",
      title: r.title,
      tmdb_id: r.id,
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
      poster_url: r.poster_url,
      overview: r.overview,
      min_quality: minQuality.value,
      root_folder: rootFolder.value,
      monitored: true,
      search_services_json: JSON.stringify(["direct-plugin", "slskd", "amule"]),
    });
    await refreshSubscription(sub.id);
    showToast(t("planner.added"), "success", 3000);
    existing.value.set(r.id, sub.id);
    navigateTo(`/planner/movies/${sub.id}`);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    addingId.value = null;
  }
}

onMounted(loadExisting);
</script>

<style scoped>
.planner-search-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.planner-search-bar .s-input-wrap {
  flex: 1;
}
.planner-advanced {
  border: 1px solid var(--s-border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
}
.planner-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--s-text, #333);
}
.planner-advanced-toggle:hover {
  background: var(--s-bg-hover, #1a1a30);
}
.planner-advanced-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid var(--s-border, #e2e8f0);
}
.planner-card {
  display: flex;
  flex-direction: column;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
  height: 100%;
}
.planner-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}
.planner-card-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--s-bg-hover, #1a1a30);
  color: var(--s-text-muted, #999);
}
.planner-overview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
}
.planner-card-actions {
  margin-top: auto;
}
</style>