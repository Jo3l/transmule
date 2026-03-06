<template>
  <div id="page-movies-yts">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("movies.title") }} — YTS</h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="load">
          <span class="mdi mdi-refresh mr-1" />{{ $t("movies.refresh") }}
        </SButton>
      </div>
    </div>

    <!-- Filters -->
    <div class="movie-filters mb-4">
      <!-- Search row -->
      <div class="movie-filters-search-row">
        <div class="movie-filter-search">
          <span class="mdi mdi-magnify" />
          <input
            v-model="filters.query_term"
            class="movie-search-input"
            type="text"
            :placeholder="$t('movies.searchPlaceholder')"
            @keydown.enter="load"
          />
          <button
            v-if="filters.query_term"
            class="movie-search-clear"
            @click="
              filters.query_term = '';
              load();
            "
          >
            <span class="mdi mdi-close" />
          </button>
        </div>
      </div>

      <!-- Select filters row -->
      <div class="movie-filters-selects-row">
        <div class="movie-filter-group">
          <label class="movie-filter-label">{{ $t("movies.labelGenre") }}</label>
          <SSelect v-model="filters.genre" :options="genreOptions" @update:model-value="load" />
        </div>
        <div class="movie-filter-group">
          <label class="movie-filter-label">{{ $t("movies.labelQuality") }}</label>
          <SSelect v-model="filters.quality" :options="qualityOptions" @update:model-value="load" />
        </div>
        <div class="movie-filter-group">
          <label class="movie-filter-label">{{ $t("movies.labelSort") }}</label>
          <SSelect v-model="filters.sort_by" :options="sortOptions" @update:model-value="load" />
        </div>
        <div class="movie-filter-group">
          <label class="movie-filter-label">{{ $t("movies.labelRating") }}</label>
          <SSelect
            v-model="filters.minimum_rating"
            :options="ratingOptions"
            @update:model-value="load"
          />
        </div>
      </div>
    </div>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />
    <SLoading v-if="loading && !movies.length" />

    <div v-else-if="movies.length" class="movies-grid">
      <div v-for="movie in movies" :key="movie.id" class="movie-card">
        <div class="movie-card-top">
          <div class="movie-cover">
            <img
              :src="movie.medium_cover_image"
              :alt="movie.title"
              class="movie-poster"
              loading="lazy"
              @error="onImgError"
            />
          </div>
          <div class="movie-info">
            <div class="movie-header">
              <a :href="movie.url" target="_blank" rel="noopener" class="movie-title">{{
                movie.title
              }}</a>
              <span class="movie-year">{{ movie.year }}</span>
            </div>
            <div class="movie-meta">
              <span v-if="movie.rating" class="movie-rating">
                <span class="mdi mdi-star" />{{ movie.rating.toFixed(1) }}
              </span>
              <span v-if="movie.runtime" class="movie-runtime">
                <span class="mdi mdi-clock-outline" />{{ formatRuntime(movie.runtime) }}
              </span>
              <span v-if="movie.language && movie.language !== 'en'" class="movie-lang">
                <span class="mdi mdi-translate" />{{ movie.language.toUpperCase() }}
              </span>
            </div>
            <div v-if="movie.genres?.length" class="movie-genres">
              <span v-for="genre in movie.genres" :key="genre" class="movie-genre-tag">{{
                genre
              }}</span>
            </div>
            <div v-if="movie.torrents?.length" class="movie-torrents">
              <div v-for="torrent in movie.torrents" :key="torrent.hash" class="torrent-row">
                <span class="torrent-quality">{{ torrent.quality }}</span>
                <span class="torrent-type">{{ torrent.type }}</span>
                <span class="torrent-size">{{ torrent.size }}</span>
                <span class="torrent-seeds"
                  ><span class="mdi mdi-arrow-up-bold" />{{ torrent.seeds }}</span
                >
                <button
                  class="torrent-add-btn"
                  :class="{
                    'is-loading': adding === torrent.hash,
                    'is-downloaded': isDownloadedByHash(torrent.hash),
                  }"
                  :disabled="!!adding"
                  :title="$t('movies.addToTransmission')"
                  @click="addToTransmission(torrent.hash, torrent.quality)"
                >
                  <span v-if="adding === torrent.hash" class="mdi mdi-loading mdi-spin" />
                  <span v-else class="mdi mdi-download" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="movie.summary" class="movie-card-desc">
          <div class="movie-summary" :class="{ 'is-expanded': expanded.has(movie.id) }">
            <div class="movie-summary-inner">{{ movie.summary }}</div>
          </div>
          <button class="movie-expand-btn" @click="toggleExpand(movie.id)">
            {{ expanded.has(movie.id) ? $t("movies.collapse") : $t("movies.expand") }}
            <span
              class="mdi"
              :class="expanded.has(movie.id) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            />
          </button>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" class="has-text-muted">{{ $t("movies.empty") }}</p>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const { isDownloadedByHash, recordDownload, loadDownloadHistory } = useDownloadHistory();

interface Torrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
}

interface Movie {
  id: number;
  url: string;
  title: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  summary: string;
  language: string;
  medium_cover_image: string;
  large_cover_image: string;
  torrents: Torrent[];
}

const movies = ref<Movie[]>([]);
const loading = ref(false);
const error = ref("");
const adding = ref<string | null>(null);
const expanded = ref(new Set<number>());

const filters = reactive({
  query_term: "",
  quality: "all",
  genre: "all",
  sort_by: "date_added",
  minimum_rating: "0",
});

const genreOptions = [
  { label: t("movies.filterAll"), value: "all" },
  "Action",
  "Adventure",
  "Animation",
  "Biography",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Film-Noir",
  "History",
  "Horror",
  "Music",
  "Musical",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Sport",
  "Thriller",
  "War",
  "Western",
];

const qualityOptions = [
  { label: t("movies.filterAll"), value: "all" },
  { label: "480p", value: "480p" },
  { label: "720p", value: "720p" },
  { label: "1080p", value: "1080p" },
  { label: "1080p x265", value: "1080p.x265" },
  { label: "2160p / 4K", value: "2160p" },
  { label: "3D", value: "3D" },
];

const sortOptions = [
  { label: t("movies.sortLatest"), value: "date_added" },
  { label: t("movies.sortYear"), value: "year" },
  { label: t("movies.sortRating"), value: "rating" },
  { label: t("movies.sortSeeds"), value: "seeds" },
  { label: t("movies.sortDownloads"), value: "download_count" },
  { label: t("movies.sortLiked"), value: "like_count" },
  { label: t("movies.sortTitle"), value: "title" },
];

const ratingOptions = [
  { label: t("movies.filterAll"), value: "0" },
  { label: "5+", value: "5" },
  { label: "6+", value: "6" },
  { label: "7+", value: "7" },
  { label: "8+", value: "8" },
  { label: "9+", value: "9" },
];

function toggleExpand(id: number) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

function formatRuntime(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function buildMagnet(hash: string, title: string): string {
  const trackers = [
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:80",
    "udp://tracker.coppersurfer.tk:6969",
    "udp://glotorrents.pw:6969/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://torrent.gresille.org:80/announce",
    "udp://p4p.arenabg.com:1337",
    "udp://tracker.leechers-paradise.org:6969",
  ];
  const dn = encodeURIComponent(title);
  const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${hash}&dn=${dn}${tr}`;
}

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = "none";
}

async function addToTransmission(hash: string, quality: string) {
  if (adding.value) return;
  adding.value = hash;
  const movie = movies.value.find((m) => m.torrents?.some((t) => t.hash === hash));
  const torrent = movie?.torrents.find((t) => t.hash === hash);
  const title = movie ? `${movie.title} (${movie.year}) [${quality}]` : hash;
  try {
    const magnet = torrent?.url?.startsWith("magnet:") ? torrent.url : buildMagnet(hash, title);
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: magnet },
    });
    recordDownload(magnet, title, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("movies.addError");
  } finally {
    adding.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams();
    if (filters.query_term) params.set("query_term", filters.query_term);
    if (filters.quality && filters.quality !== "all") params.set("quality", filters.quality);
    if (filters.genre && filters.genre !== "all") params.set("genre", filters.genre);
    if (filters.sort_by) params.set("sort_by", filters.sort_by);
    if (filters.minimum_rating && filters.minimum_rating !== "0")
      params.set("minimum_rating", filters.minimum_rating);
    const qs = params.toString();
    const data = await apiFetch<{ movies: Movie[]; movie_count: number }>(
      `/api/movies${qs ? `?${qs}` : ""}`,
    );
    movies.value = data.movies ?? [];
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("movies.fetchError");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadDownloadHistory();
  load();
});
</script>

<style scoped>
.movie-filters {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.movie-filters-search-row {
  display: flex;
}

.movie-filters-selects-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}

.movie-filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.movie-filter-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--s-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.movie-filter-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;

  .mdi-magnify {
    position: absolute;
    left: 0.55rem;
    color: var(--s-text-muted);
    font-size: 0.95rem;
    pointer-events: none;
  }
}

.movie-search-input {
  width: 100%;
  padding: 0.35rem 1.8rem 0.35rem 1.8rem;
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

.movie-search-clear {
  position: absolute;
  right: 0.4rem;
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-muted);
  padding: 0;
  font-size: 0.9rem;

  &:hover {
    color: var(--s-accent);
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

.movie-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.movie-header {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
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

.movie-year {
  font-size: 0.78rem;
  color: var(--s-text-muted);
  white-space: nowrap;
}

.movie-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: var(--s-text-secondary);
}

.movie-rating .mdi-star {
  color: #f5c518;
  margin-right: 0.2rem;
}
.movie-runtime .mdi,
.movie-lang .mdi {
  margin-right: 0.2rem;
  opacity: 0.7;
}

.movie-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.movie-genre-tag {
  font-size: 0.72rem;
  padding: 0.1rem 0.5rem;
  border-radius: 1rem;
  background: var(--s-bg-muted);
  color: var(--s-text-muted);
  border: 1px solid var(--s-border);
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

.movie-torrents {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.torrent-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
}

.torrent-quality {
  font-weight: 600;
  color: var(--s-text);
  min-width: 3rem;
}
.torrent-type {
  color: var(--s-text-muted);
  min-width: 3.5rem;
  text-transform: capitalize;
}
.torrent-size {
  color: var(--s-text-secondary);
  min-width: 4rem;
}

.torrent-seeds {
  display: flex;
  align-items: center;
  color: #4caf50;
  font-size: 0.76rem;

  .mdi {
    font-size: 0.85rem;
  }
}

.torrent-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: var(--s-radius);
  border: 1px solid var(--s-border);
  background: var(--s-bg-muted);
  color: var(--s-accent);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
  padding: 0;
  font-size: 0.9rem;
  margin-left: auto;

  &:hover:not(:disabled) {
    background: var(--s-accent);
    border-color: var(--s-accent);
    color: #fff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &.is-loading {
    pointer-events: none;
  }
  &.is-downloaded {
    border-color: var(--s-warning);
    color: var(--s-warning);
    &:hover:not(:disabled) {
      background: var(--s-warning);
      border-color: var(--s-warning);
      color: #fff;
    }
  }
}
</style>
