<template>
  <div id="page-showrss">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("shows.title") }} — ShowRSS</h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="load">
          <span class="mdi mdi-refresh mr-1" />{{ $t("shows.refresh") }}
        </SButton>
      </div>
    </div>

    <p class="has-text-muted mb-4 is-size-7">
      {{ $t("shows.subtitle") }}
      <a href="https://showrss.info" target="_blank" rel="noopener">showrss.info</a>
    </p>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />
    <SLoading v-if="loading && !items.length" />

    <div v-else-if="items.length" class="movies-grid">
      <div
        v-for="item in items"
        :key="item.guid"
        class="movie-card"
        :data-item-id="item.guid"
        @click="openModal(item)"
      >
        <!-- Cover + info -->
        <div class="movie-card-top">
          <div class="movie-cover">
            <div
              v-if="loadingCovers.has(item.guid) && covers[item.guid] === undefined"
              class="movie-poster movie-poster-skeleton"
            >
              <span class="mdi mdi-loading mdi-spin" />
            </div>
            <img
              v-else-if="covers[item.guid]"
              :src="covers[item.guid]!"
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
              <span v-if="item.pubDate" class="movie-meta-item">
                <span class="mdi mdi-calendar" />{{ formatDate(item.pubDate) }}
              </span>
              <span v-if="item.episodes.length" class="movie-meta-item">
                <span class="mdi mdi-television-play" />{{ item.episodes.length }}
                {{ $t("shows.episodes") }}
              </span>
            </div>

            <p v-if="item.description" class="card-desc-text">
              {{ item.description }}
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div class="download-card-footer">
          <span v-if="item.episodes.length" class="ep-count-badge">
            <span class="mdi mdi-magnet mr-1" />{{ item.episodes.length }}
            {{ $t("shows.episodes") }}
          </span>
          <SButton
            size="sm"
            :variant="anyDownloaded(item) ? 'warning' : undefined"
            :disabled="!!adding"
            @click.stop="openModal(item)"
          >
            <span class="mdi mdi-download mr-1" />
            {{ $t("shows.download") }}
          </SButton>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" class="has-text-muted">{{ $t("shows.empty") }}</p>

    <!-- Episode modal -->
    <Teleport to="body">
      <div v-if="modal" class="dt-modal-overlay" @click.self="modal = null">
        <div class="dt-modal">
          <div class="dt-modal-header">
            <span class="dt-modal-title">{{ modal.title }}</span>
            <button class="dt-modal-close" @click="modal = null">
              <span class="mdi mdi-close" />
            </button>
          </div>
          <div class="dt-modal-body">
            <div class="dt-modal-top">
              <img
                v-if="covers[modal.guid]"
                :src="covers[modal.guid]!"
                class="dt-modal-cover"
                @error="onImgError"
              />
              <div class="dt-modal-meta">
                <div v-if="modal.pubDate" class="movie-meta-item">
                  <span class="mdi mdi-calendar" />{{ formatDate(modal.pubDate) }}
                </div>
                <div v-if="modal.episodes.length" class="movie-meta-item">
                  <span class="mdi mdi-television-play" />{{ modal.episodes.length }}
                  {{ $t("shows.episodes") }}
                </div>
              </div>
            </div>

            <p v-if="modal.description" class="dt-modal-desc">
              {{ modal.description }}
            </p>

            <div v-if="modal.episodes.length" class="dt-modal-episodes">
              <div
                v-for="(ep, i) in modal.episodes"
                :key="ep.magnet"
                class="episode-row"
                :class="{ 'is-loading': adding === ep.magnet, 'is-odd': i % 2 !== 0 }"
              >
                <span class="ep-title">{{ ep.title }}</span>
                <SButton
                  size="sm"
                  :variant="isDownloaded(ep.magnet) ? 'warning' : undefined"
                  :loading="adding === ep.magnet"
                  :disabled="!!adding"
                  @click="addEpisode(ep.magnet, ep.title)"
                >
                  <span class="mdi mdi-download mr-1" />
                  {{ $t("shows.download") }}
                </SButton>
              </div>
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

interface Episode {
  title: string;
  magnet: string;
}

interface ShowItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  episodes: Episode[];
}

const items = ref<ShowItem[]>([]);
const covers = ref<Record<string, string | null | undefined>>({});
const loadingCovers = ref(new Set<string>());
const loading = ref(false);
const error = ref("");
const adding = ref<string | null>(null);
const modal = ref<ShowItem | null>(null);

let observer: IntersectionObserver | null = null;

function openModal(item: ShowItem) {
  modal.value = item;
}

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = "none";
}

function anyDownloaded(item: ShowItem): boolean {
  return item.episodes.some((ep) => isDownloaded(ep.magnet));
}

function formatDate(raw: string): string {
  if (!raw) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(raw));
  } catch {
    return raw;
  }
}

async function loadCover(item: ShowItem) {
  if (covers.value[item.guid] !== undefined || loadingCovers.value.has(item.guid)) return;
  const s = new Set(loadingCovers.value);
  s.add(item.guid);
  loadingCovers.value = s;
  try {
    const d = await apiFetch<{ image: string | null }>(
      `/api/episodate-search?q=${encodeURIComponent(item.title)}`,
    );
    covers.value = { ...covers.value, [item.guid]: d?.image ?? null };
  } catch {
    covers.value = { ...covers.value, [item.guid]: null };
  } finally {
    const s2 = new Set(loadingCovers.value);
    s2.delete(item.guid);
    loadingCovers.value = s2;
  }
}

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = (entry.target as HTMLElement).dataset.itemId;
        const item = items.value.find((m) => m.guid === id);
        if (!item) return;
        observer!.unobserve(entry.target);
        loadCover(item);
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

async function addEpisode(magnet: string, title: string) {
  if (adding.value) return;
  adding.value = magnet;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: magnet },
    });
    recordDownload(magnet, title, "transmission");
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.addError");
  } finally {
    adding.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  covers.value = {};
  observer?.disconnect();
  try {
    const data = await apiFetch<{ items: ShowItem[] }>("/api/shows-rss");
    items.value = data.items;
    setupObserver();
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || t("shows.fetchError");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadDownloadHistory();
  load();
});
onUnmounted(() => observer?.disconnect());
</script>

<style scoped>
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

.movie-cover {
  flex-shrink: 0;
  width: 90px;
}

.movie-poster {
  width: 90px;
  height: 130px;
  object-fit: cover;
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
  object-fit: cover;
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

.ep-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--s-text);
}
</style>
