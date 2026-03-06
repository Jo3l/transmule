<template>
  <div id="page-dontorrent-shows">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("shows.title") }} — DonTorrent</h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="load">
          <span class="mdi mdi-refresh mr-1" />{{ $t("shows.refresh") }}
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
          placeholder="https://www21.dontorrent.link/ultimas-series"
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
        {{ $t("shows.saveUrl") }}
      </SButton>
    </div>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />
    <SLoading v-if="loading && !items.length" />

    <div v-else-if="items.length" class="movies-grid">
      <div
        v-for="item in items"
        :key="item.id"
        class="movie-card"
        :data-item-id="item.id"
        @click="openModal(item)"
      >
        <!-- Cover + info -->
        <div class="movie-card-top">
          <div class="movie-cover">
            <div
              v-if="loadingDetails.has(item.id) && !details[item.id]?.cover && !item.cover"
              class="movie-poster movie-poster-skeleton"
            >
              <span class="mdi mdi-loading mdi-spin" />
            </div>
            <img
              v-else-if="details[item.id]?.cover || item.cover"
              :src="details[item.id]?.cover || item.cover"
              :alt="item.title"
              class="movie-poster"
              loading="lazy"
              @error="onImgError"
            />
            <div v-else class="movie-poster movie-poster-placeholder">
              <span class="mdi mdi-television-play" />
            </div>
          </div>

          <div class="movie-info">
            <div class="movie-header">
              <span class="movie-title">{{ item.title }}</span>
            </div>

            <div class="movie-meta">
              <span v-if="item.date" class="movie-meta-item">
                <span class="mdi mdi-calendar" />{{ item.date }}
              </span>
              <span v-if="item.format || details[item.id]?.format" class="movie-meta-item">
                <span class="mdi mdi-quality-high" />{{ details[item.id]?.format || item.format }}
              </span>
              <span v-if="details[item.id]?.size" class="movie-meta-item">
                <span class="mdi mdi-harddisk" />{{ details[item.id].size }}
              </span>
            </div>

            <div v-if="details[item.id]?.genre" class="movie-meta">
              <span class="movie-meta-item">
                <span class="mdi mdi-tag" />{{ details[item.id].genre }}
              </span>
            </div>

            <p v-if="details[item.id]?.description" class="card-desc-text">
              {{ details[item.id].description }}
            </p>
          </div>
        </div>
        <div class="download-card-footer">
          <span v-if="details[item.id]?.episodes?.length" class="ep-count-badge">
            <span class="mdi mdi-television-play mr-1" />{{ details[item.id].episodes.length }}
            {{ $t("shows.episodes") }}
          </span>
          <SButton
            size="sm"
            :variant="isDownloaded(details[item.id]?.torrentUrl) ? 'warning' : undefined"
            :loading="fetching === item.id"
            :disabled="!!adding || !!fetching"
            @click.stop="openModal(item)"
          >
            <span class="mdi mdi-download mr-1" />
            {{ $t("shows.download") }}
          </SButton>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" class="has-text-muted">{{ $t("shows.empty") }}</p>

    <!-- Episode / detail modal -->
    <Teleport to="body">
      <div v-if="modal" class="dt-modal-overlay" @click.self="modal = null">
        <div class="dt-modal">
          <div class="dt-modal-header">
            <span class="dt-modal-title">{{ modal.item.title }}</span>
            <button class="dt-modal-close" @click="modal = null">
              <span class="mdi mdi-close" />
            </button>
          </div>
          <div class="dt-modal-body">
            <div class="dt-modal-top">
              <img
                v-if="modal.detail?.cover"
                :src="modal.detail.cover"
                class="dt-modal-cover"
                @error="onImgError"
              />
              <div class="dt-modal-meta">
                <div v-if="modal.item.date" class="movie-meta-item">
                  <span class="mdi mdi-calendar" />{{ modal.item.date }}
                </div>
                <div v-if="modal.detail?.format || modal.item.format" class="movie-meta-item">
                  <span class="mdi mdi-quality-high" />{{
                    modal.detail?.format || modal.item.format
                  }}
                </div>
                <div v-if="modal.detail?.size" class="movie-meta-item">
                  <span class="mdi mdi-harddisk" />{{ modal.detail.size }}
                </div>
                <div v-if="modal.detail?.year" class="movie-meta-item">
                  <span class="mdi mdi-filmstrip" />{{ modal.detail.year }}
                </div>
                <div v-if="modal.detail?.genre" class="movie-meta-item">
                  <span class="mdi mdi-tag" />{{ modal.detail.genre }}
                </div>
              </div>
            </div>

            <SLoading v-if="loadingDetails.has(modal.item.id)" class="mt-3" />

            <p v-if="modal.detail?.description" class="dt-modal-desc">
              {{ modal.detail.description }}
            </p>

            <!-- Series: episode list -->
            <div
              v-if="modal.detail?.isSeries && modal.detail?.episodes?.length"
              class="dt-modal-episodes"
            >
              <div
                v-for="(ep, i) in modal.detail.episodes"
                :key="ep.code"
                class="episode-row"
                :class="{ 'is-loading': adding === ep.code, 'is-odd': i % 2 !== 0 }"
              >
                <span class="ep-code">{{ ep.code }}</span>
                <SButton
                  size="sm"
                  :variant="isDownloaded(ep.torrentUrl) ? 'warning' : undefined"
                  :loading="adding === ep.code"
                  :disabled="!!adding"
                  @click="addEpisode(modal.item, ep)"
                >
                  <span class="mdi mdi-download mr-1" />
                  {{ $t("shows.download") }}
                </SButton>
                <span class="ep-date">{{ ep.date }}</span>
              </div>
            </div>

            <!-- Non-series: single download -->
            <div v-else-if="modal.detail && !modal.detail.isSeries" class="dt-modal-download">
              <SButton
                size="sm"
                :variant="isDownloaded(modal.detail?.torrentUrl) ? 'warning' : undefined"
                :loading="adding === modal.item.id || fetching === modal.item.id"
                :disabled="!!adding || !!fetching"
                @click="download(modal.item)"
              >
                <span class="mdi mdi-download mr-1" />
                {{ $t("shows.addToTransmission") }}
              </SButton>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const { isDownloaded, recordDownload, loadDownloadHistory } = useDownloadHistory();

interface DonItem {
  id: string;
  title: string;
  url: string;
  cover: string;
  format: string;
  date: string;
}

interface ItemDetail {
  cover: string;
  torrentUrl: string;
  year: string;
  genre: string;
  director: string;
  actors: string;
  format: string;
  size: string;
  description: string;
  isSeries?: boolean;
  episodes?: { code: string; torrentUrl: string; date: string }[];
}

const items = ref<DonItem[]>([]);
const details = ref<Record<string, ItemDetail>>({});
const loadingDetails = ref(new Set<string>());
const loading = ref(false);
const error = ref("");
interface ModalState {
  item: DonItem;
  detail: ItemDetail | null;
}

const adding = ref<string | null>(null);
const fetching = ref<string | null>(null);
const modal = ref<ModalState | null>(null);
const DEFAULT_URL = "https://www21.dontorrent.link/descargar-series";
const HD_URL = "https://www21.dontorrent.link/series/hd";
const sourceUrl = ref(DEFAULT_URL);
const savedUrl = ref(DEFAULT_URL);
const urlChanged = computed(() => sourceUrl.value.trim() !== savedUrl.value);

let observer: IntersectionObserver | null = null;

function openModal(item: DonItem) {
  modal.value = { item, detail: details.value[item.id] ?? null };
  loadDetail(item);
}

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = "none";
}

async function loadDetail(item: DonItem) {
  if (details.value[item.id] || loadingDetails.value.has(item.id)) return;
  const s = new Set(loadingDetails.value);
  s.add(item.id);
  loadingDetails.value = s;
  try {
    const d = await apiFetch<ItemDetail>(
      `/api/dontorrent-content?url=${encodeURIComponent(item.url)}`,
    );
    if (d) {
      details.value = { ...details.value, [item.id]: d };
      // refresh modal if it's open for this item
      if (modal.value?.item.id === item.id) {
        modal.value = { item, detail: d };
      }
    }
  } catch {
    // silently ignore — detail is optional
  } finally {
    const s2 = new Set(loadingDetails.value);
    s2.delete(item.id);
    loadingDetails.value = s2;
  }
}

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = (entry.target as HTMLElement).dataset.itemId;
        const item = items.value.find((m) => m.id === id);
        if (!item) return;
        observer!.unobserve(entry.target);
        loadDetail(item);
      });
    },
    { rootMargin: "150px" },
  );
  nextTick(() => {
    document.querySelectorAll<HTMLElement>("[data-item-id]").forEach((el) => {
      observer!.observe(el);
    });
  });
}

async function addEpisode(item: DonItem, ep: { code: string; torrentUrl: string; date: string }) {
  if (adding.value) return;
  adding.value = ep.code;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: ep.torrentUrl },
    });
    recordDownload(ep.torrentUrl, `${item.title} ${ep.code}`, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.addError");
  } finally {
    adding.value = null;
  }
}

async function download(item: DonItem) {
  if (adding.value || fetching.value) return;

  let detail = details.value[item.id];
  if (!detail) {
    fetching.value = item.id;
    try {
      const d = await apiFetch<ItemDetail>(
        `/api/dontorrent-content?url=${encodeURIComponent(item.url)}`,
      );
      if (d) {
        details.value = { ...details.value, [item.id]: d };
        detail = d;
      }
    } catch {
      // handled below
    } finally {
      fetching.value = null;
    }
  }

  if (!detail?.torrentUrl) {
    error.value = t("shows.noTorrent");
    return;
  }

  adding.value = item.id;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: detail.torrentUrl },
    });
    recordDownload(detail.torrentUrl, item.title, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.addError");
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
    const [data, hdData] = await Promise.all([
      apiFetch<{ movies: DonItem[] }>(`/api/dontorrent?url=${encodeURIComponent(sourceUrl.value)}`),
      apiFetch<{ movies: DonItem[] }>(`/api/dontorrent?url=${encodeURIComponent(HD_URL)}`).catch(
        () => ({ movies: [] as DonItem[] }),
      ),
    ]);
    const seen = new Set<string>();
    const merged: DonItem[] = [];
    for (const item of [...(data.movies ?? []), ...(hdData.movies ?? [])]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    items.value = merged;
    savedUrl.value = sourceUrl.value.trim();
    setupObserver();
    apiFetch("/api/preferences", {
      method: "PUT",
      body: { dontorrent_series_url: sourceUrl.value.trim() },
    }).catch(() => {});
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.fetchError");
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
    if (prefs?.dontorrent_series_url) {
      sourceUrl.value = prefs.dontorrent_series_url;
      savedUrl.value = prefs.dontorrent_series_url;
    }
  } catch {
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
  cursor: pointer;

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

.download-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.75rem 0.75rem 0.5rem;
  border-top: 1px solid var(--s-border);
  margin-top: auto;
}

.ep-count-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  color: var(--s-text-secondary);
  margin-right: auto;

  .mdi {
    opacity: 0.7;
  }
}

.card-desc-text {
  font-size: 0.78rem;
  color: var(--s-text-secondary);
  line-height: 1.5;
  margin: 0.35rem 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
  color: var(--s-text);
  line-height: 1.3;
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

.movie-torrents {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: auto;
  padding-top: 0.4rem;
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

.torrent-size {
  color: var(--s-text-secondary);
}

.series-episodes {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.episode-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.82rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--s-radius);
  background: transparent;

  &.is-odd {
    background: var(--s-bg-muted);
  }

  &.is-loading {
    opacity: 0.6;
    pointer-events: none;
  }
}

.ep-code {
  font-weight: 600;
  color: var(--s-text);
  min-width: 3rem;
  flex-shrink: 0;
}

.ep-date {
  color: var(--s-text-muted);
  font-size: 0.72rem;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Modal ──────────────────────────────────────────────────────────── */

.dt-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.dt-modal {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius-lg);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dt-modal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}

.dt-modal-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--s-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dt-modal-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-muted);
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.2rem;
  border-radius: var(--s-radius);

  &:hover {
    color: var(--s-text);
    background: var(--s-bg-muted);
  }
}

.dt-modal-body {
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dt-modal-top {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.dt-modal-cover {
  width: 90px;
  height: 130px;
  object-fit: contain;
  object-position: left center;
  flex-shrink: 0;
  border-radius: var(--s-radius);
  background: var(--s-bg-muted);
}

.dt-modal-meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
}

.dt-modal-desc {
  font-size: 0.84rem;
  color: var(--s-text-secondary);
  line-height: 1.6;
  margin: 0;
}

.dt-modal-episodes {
  border-top: 1px solid var(--s-border);
  padding-top: 0.5rem;
}

.dt-modal-download {
  border-top: 1px solid var(--s-border);
  padding-top: 0.75rem;
}
</style>
