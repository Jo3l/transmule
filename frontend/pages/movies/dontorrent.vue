<template>
  <div id="page-dontorrent">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("movies.title") }} — DonTorrent</h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="load">
          <span class="mdi mdi-refresh mr-1" />{{ $t("movies.refresh") }}
        </SButton>
      </div>
    </div>

    <!-- URL bar -->
    <div class="dt-url-bar mb-4">
      <div class="movie-filter-search">
        <span class="mdi mdi-link" />
        <input
          v-model="sourceUrl"
          class="movie-search-input"
          type="text"
          placeholder="https://www21.dontorrent.link/ultimos"
          @keydown.enter="saveAndLoad"
        />
      </div>
      <SButton
        size="sm"
        :variant="urlChanged ? 'primary' : 'default'"
        :disabled="loading"
        @click="saveAndLoad"
      >
        <span class="mdi mdi-content-save mr-1" />
        {{ $t("movies.saveUrl") }}
      </SButton>
    </div>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />
    <SLoading v-if="loading && !movies.length" />

    <div v-else-if="movies.length" class="movies-grid">
      <div v-for="movie in movies" :key="movie.id" class="movie-card" :data-movie-id="movie.id">
        <!-- Top row: cover + info -->
        <div class="movie-card-top">
          <div class="movie-cover">
            <div
              v-if="loadingDetails.has(movie.id) && !details[movie.id]?.cover && !movie.cover"
              class="movie-poster movie-poster-skeleton"
            >
              <span class="mdi mdi-loading mdi-spin" />
            </div>
            <img
              v-else-if="details[movie.id]?.cover || movie.cover"
              :src="details[movie.id]?.cover || movie.cover"
              :alt="movie.title"
              class="movie-poster"
              loading="lazy"
              @error="onImgError"
            />
            <div v-else class="movie-poster movie-poster-placeholder">
              <span class="mdi mdi-movie" />
            </div>
          </div>

          <div class="movie-info">
            <div class="movie-header">
              <a :href="movie.url" target="_blank" rel="noopener" class="movie-title">
                {{ movie.title }}
              </a>
            </div>

            <div class="movie-meta">
              <span v-if="movie.date" class="movie-meta-item">
                <span class="mdi mdi-calendar" />{{ movie.date }}
              </span>
              <span v-if="movie.format || details[movie.id]?.format" class="movie-meta-item">
                <span class="mdi mdi-quality-high" />{{ details[movie.id]?.format || movie.format }}
              </span>
              <span v-if="details[movie.id]?.size" class="movie-meta-item">
                <span class="mdi mdi-harddisk" />{{ details[movie.id].size }}
              </span>
              <span v-if="details[movie.id]?.year" class="movie-meta-item">
                <span class="mdi mdi-filmstrip" />{{ details[movie.id].year }}
              </span>
            </div>

            <div v-if="details[movie.id]?.genre" class="movie-meta">
              <span class="movie-meta-item">
                <span class="mdi mdi-tag" />{{ details[movie.id].genre }}
              </span>
            </div>

            <div v-if="details[movie.id]?.director" class="movie-meta-small">
              <span class="mdi mdi-account-tie" />{{ details[movie.id].director }}
            </div>

            <div v-if="details[movie.id]?.actors" class="movie-meta-small dt-actors">
              <span class="mdi mdi-account-group" />{{ details[movie.id].actors }}
            </div>
          </div>
        </div>

        <!-- Description row (only shown when details are loaded) -->
        <div v-if="details[movie.id]?.description" class="movie-card-desc">
          <div class="movie-summary" :class="{ 'is-expanded': expanded.has(movie.id) }">
            <div class="movie-summary-inner">{{ details[movie.id].description }}</div>
          </div>
          <button class="movie-expand-btn" @click="toggleExpand(movie.id)">
            {{ expanded.has(movie.id) ? $t("movies.collapse") : $t("movies.expand") }}
            <span
              class="mdi"
              :class="expanded.has(movie.id) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            />
          </button>
        </div>

        <!-- Footer: download button bottom-right -->
        <div class="download-card-footer">
          <SButton
            size="sm"
            :variant="isDownloaded(details[movie.id]?.torrentUrl) ? 'warning' : undefined"
            :loading="adding === movie.id || fetching === movie.id"
            :disabled="!!adding || !!fetching"
            :title="$t('movies.addToTransmission')"
            @click="download(movie)"
          >
            <span class="mdi mdi-download mr-1" />
            {{ $t("movies.download") }}
          </SButton>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" class="has-text-muted">{{ $t("movies.empty") }}</p>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const { isDownloaded, recordDownload, loadDownloadHistory } = useDownloadHistory();

interface DonMovie {
  id: string;
  title: string;
  url: string;
  cover: string;
  format: string;
  date: string;
}

interface MovieDetail {
  cover: string;
  torrentUrl: string;
  year: string;
  genre: string;
  director: string;
  actors: string;
  format: string;
  size: string;
  description: string;
}

const movies = ref<DonMovie[]>([]);
const details = ref<Record<string, MovieDetail>>({});
const loadingDetails = ref(new Set<string>());
const loading = ref(false);
const error = ref("");
const adding = ref<string | null>(null);
const fetching = ref<string | null>(null);
const expanded = ref(new Set<string>());
const DEFAULT_URL = "https://www21.dontorrent.link/ultimos";
const sourceUrl = ref(DEFAULT_URL);
const savedUrl = ref(DEFAULT_URL);
const urlChanged = computed(() => sourceUrl.value.trim() !== savedUrl.value);

let observer: IntersectionObserver | null = null;

function toggleExpand(id: string) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = "none";
}

async function loadDetail(movie: DonMovie) {
  if (details.value[movie.id] || loadingDetails.value.has(movie.id)) return;
  const s = new Set(loadingDetails.value);
  s.add(movie.id);
  loadingDetails.value = s;
  try {
    const d = await apiFetch<MovieDetail>(
      `/api/dontorrent-content?url=${encodeURIComponent(movie.url)}`,
    );
    if (d) details.value = { ...details.value, [movie.id]: d };
  } catch {
    // silently ignore — detail is optional
  } finally {
    const s2 = new Set(loadingDetails.value);
    s2.delete(movie.id);
    loadingDetails.value = s2;
  }
}

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = (entry.target as HTMLElement).dataset.movieId;
        const movie = movies.value.find((m) => m.id === id);
        if (!movie) return;
        observer!.unobserve(entry.target);
        loadDetail(movie);
      });
    },
    { rootMargin: "150px" },
  );
  nextTick(() => {
    document.querySelectorAll<HTMLElement>("[data-movie-id]").forEach((el) => {
      observer!.observe(el);
    });
  });
}

async function download(movie: DonMovie) {
  if (adding.value || fetching.value) return;

  // Use already-loaded detail or fetch now
  let detail = details.value[movie.id];
  if (!detail) {
    fetching.value = movie.id;
    try {
      const d = await apiFetch<MovieDetail>(
        `/api/dontorrent-content?url=${encodeURIComponent(movie.url)}`,
      );
      if (d) {
        details.value = { ...details.value, [movie.id]: d };
        detail = d;
      }
    } catch {
      // handled below
    } finally {
      fetching.value = null;
    }
  }

  if (!detail?.torrentUrl) {
    error.value = t("movies.noTorrent");
    return;
  }

  adding.value = movie.id;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: detail.torrentUrl },
    });
    recordDownload(detail.torrentUrl, movie.title, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("movies.addError");
  } finally {
    adding.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  details.value = {};
  observer?.disconnect();
  try {
    const data = await apiFetch<{ movies: DonMovie[] }>(
      `/api/dontorrent?url=${encodeURIComponent(sourceUrl.value)}`,
    );
    movies.value = data.movies ?? [];
    savedUrl.value = sourceUrl.value.trim();
    setupObserver();
    // Persist the URL so it survives page reloads
    apiFetch("/api/preferences", {
      method: "PUT",
      body: { dontorrent_url: sourceUrl.value.trim() },
    }).catch(() => {});
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("movies.fetchError");
  } finally {
    loading.value = false;
  }
}

function saveAndLoad() {
  if (urlChanged.value) load();
}

onMounted(async () => {
  const auth = useAuth();
  try {
    const prefs = await apiFetch<Record<string, string>>("/api/preferences");
    if (prefs?.dontorrent_url) {
      sourceUrl.value = prefs.dontorrent_url;
      savedUrl.value = prefs.dontorrent_url;
    }
  } catch {
    // If auth was cleared (401), don't proceed — navigation to /login is already triggered
    if (!auth.token.value) return;
  }
  await loadDownloadHistory();
  load();
});
onUnmounted(() => observer?.disconnect());
</script>

<style scoped>
.dt-url-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.movie-filter-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;

  .mdi-link {
    position: absolute;
    left: 0.55rem;
    color: var(--s-text-muted);
    font-size: 0.95rem;
    pointer-events: none;
  }
}

.movie-search-input {
  width: 100%;
  padding: 0.35rem 0.75rem 0.35rem 1.8rem;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  background: var(--s-bg-surface);
  color: var(--s-text);
  font-size: 0.84rem;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: var(--s-accent);
  }
  &::placeholder {
    color: var(--s-text-muted);
  }
}

.movies-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 540px) {
    grid-template-columns: 1fr;
  }
}

.movie-card {
  display: flex;
  flex-direction: column;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius-lg);
  overflow: hidden;
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--s-accent);
  }
}

.movie-card-top {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem;
  flex: 1;
}

.movie-card-desc {
  padding: 0.6rem 0.75rem 0.75rem;
  border-top: 1px solid var(--s-border);
}

.movie-cover {
  flex-shrink: 0;
  width: 90px;
}

.movie-poster {
  width: 90px;
  height: 130px;
  object-fit: contain;
  object-position: left center;
  display: block;
  background: var(--s-bg-muted);
  border-radius: var(--s-radius);
}

.movie-poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--s-text-muted);
  font-size: 2rem;
}

.movie-poster-skeleton {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--s-bg-muted);
  color: var(--s-text-muted);
  font-size: 1.4rem;
  border-radius: var(--s-radius);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.movie-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.movie-header {
  display: flex;
  flex-wrap: wrap;
}

.movie-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--s-accent);
  text-decoration: none;
  line-height: 1.3;

  &:hover {
    color: var(--s-accent-hover);
  }
}

.movie-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--s-text-secondary);
}

.movie-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;

  .mdi {
    opacity: 0.7;
    font-size: 0.85rem;
  }
}

.movie-meta-small {
  font-size: 0.75rem;
  color: var(--s-text-muted);
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
  line-height: 1.4;

  .mdi {
    flex-shrink: 0;
    margin-top: 0.1rem;
    opacity: 0.7;
  }
}

.dt-actors {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.movie-summary {
  max-height: 3.4em;
  overflow: hidden;
  position: relative;
  transition: max-height 0.25s ease;

  &.is-expanded {
    max-height: 600px;
  }

  &:not(.is-expanded)::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.6em;
    background: linear-gradient(transparent, var(--s-bg-surface));
  }
}

.movie-summary-inner {
  font-size: 0.8rem;
  color: var(--s-text-secondary);
  line-height: 1.55;
}

.movie-expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.72rem;
  color: var(--s-text-muted);
  padding: 0;

  &:hover {
    color: var(--s-accent);
  }
}

.download-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.75rem 0.75rem 0.5rem;
  border-top: 1px solid var(--s-border);
  margin-top: auto;
}
</style>
