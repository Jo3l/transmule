<template>
  <div class="media-card" :data-item-id="item.id" @click="isSeries ? $emit('open', item) : null">
    <!-- Top: cover + info -->
    <div class="media-card-top">
      <div class="media-cover">
        <div v-if="coverLoading" class="media-poster media-poster-skeleton">
          <span class="mdi mdi-loading mdi-spin" />
        </div>
        <img
          v-else-if="coverSrc"
          :src="coverSrc"
          :alt="item.title"
          class="media-poster"
          loading="lazy"
          @error="onImgError"
        />
        <div v-else class="media-poster media-poster-placeholder">
          <span class="mdi" :class="isSeries ? 'mdi-television-play' : 'mdi-movie'" />
        </div>
      </div>

      <div class="media-info">
        <div class="media-header">
          <a
            v-if="item.sourceUrl && !isSeries"
            :href="item.sourceUrl"
            target="_blank"
            rel="noopener"
            class="media-title is-link"
            >{{ item.title }}</a
          >
          <span v-else class="media-title">{{ item.title }}</span>
          <span v-if="item.year" class="media-year">{{ item.year }}</span>
        </div>

        <div class="media-meta">
          <span v-if="item.rating" class="media-meta-item">
            <span class="mdi mdi-star media-star" />{{ Number(item.rating).toFixed(1) }}
          </span>
          <span v-if="item.runtime" class="media-meta-item">
            <span class="mdi mdi-clock-outline" />{{ formatRuntime(item.runtime) }}
          </span>
          <span v-if="item.date" class="media-meta-item">
            <span class="mdi mdi-calendar" />{{ formatDate(item.date) }}
          </span>
          <span v-if="item.format" class="media-meta-item">
            <span class="mdi mdi-quality-high" />{{ item.format }}
          </span>
          <span v-if="item.size" class="media-meta-item">
            <span class="mdi mdi-harddisk" />{{ item.size }}
          </span>
          <span v-if="item.language && item.language !== 'en'" class="media-meta-item">
            <span class="mdi mdi-translate" />{{ item.language.toUpperCase() }}
          </span>
        </div>

        <div v-if="item.genres?.length" class="media-genres">
          <span v-for="g in item.genres" :key="g" class="media-genre-tag">{{ g }}</span>
        </div>

        <div v-if="item.genre && !item.genres?.length" class="media-meta">
          <span class="media-meta-item"><span class="mdi mdi-tag" />{{ item.genre }}</span>
        </div>

        <div v-if="item.director" class="media-meta-small">
          <span class="mdi mdi-account-tie" />{{ item.director }}
        </div>
        <div v-if="item.actors" class="media-meta-small media-actors">
          <span class="mdi mdi-account-group" />{{ item.actors }}
        </div>

        <p v-if="item.description" class="media-desc-inline">
          {{ item.description }}
        </p>
      </div>
    </div>

    <!-- Download footer -->
    <div class="download-card-footer">
      <!-- Series: episode count badge + open button -->
      <template v-if="isSeries">
        <span v-if="episodeCount > 0" class="ep-count-badge">
          <span class="mdi mdi-television-play mr-1" />{{ episodeCount }}
          {{ $t("shows.episodes") }}
        </span>
        <SButton
          size="sm"
          :variant="anyLinkDownloaded ? 'warning' : undefined"
          :disabled="!!busy"
          @click.stop="$emit('open', item)"
        >
          <span class="mdi mdi-download mr-1" />{{ $t("shows.download") }}
        </SButton>
      </template>

      <!-- Movies with multiple torrent rows -->
      <template v-else-if="item.links && item.links.length > 1">
        <div v-for="link in item.links" :key="link.hash || link.url" class="torrent-row">
          <span v-if="link.quality" class="torrent-quality">{{ link.quality }}</span>
          <span v-if="link.type" class="torrent-type">{{ link.type }}</span>
          <span v-if="link.size" class="torrent-size">{{ link.size }}</span>
          <span v-if="link.seeds" class="torrent-seeds">
            <span class="mdi mdi-arrow-up-bold" />{{ link.seeds }}
          </span>
          <SButton
            size="sm"
            :variant="isLinkDownloaded(link) ? 'warning' : undefined"
            :loading="busy === (link.hash || link.url)"
            :disabled="!!busy"
            :title="$t('movies.addToTransmission')"
            @click.stop="$emit('download-link', item, link)"
          >
            <span class="mdi mdi-download mr-1" />{{ $t("movies.download") }}
          </SButton>
        </div>
      </template>

      <!-- Single download button -->
      <template v-else>
        <SButton
          size="sm"
          :variant="anyLinkDownloaded ? 'warning' : undefined"
          :loading="busy === item.id"
          :disabled="!!busy"
          :title="$t('movies.addToTransmission')"
          @click.stop="$emit('download-link', item, item.links?.[0] || null)"
        >
          <span class="mdi mdi-download mr-1" />{{ $t("movies.download") }}
        </SButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
interface MediaLink {
  label?: string;
  url: string;
  quality?: string;
  type?: string;
  size?: string;
  seeds?: number;
  hash?: string;
}

interface MediaEpisode {
  code: string;
  links: MediaLink[];
  date?: string;
}

interface MediaItem {
  id: string;
  title: string;
  cover?: string;
  year?: number | string;
  date?: string;
  genre?: string;
  rating?: number | string;
  runtime?: number;
  description?: string;
  format?: string;
  size?: string;
  director?: string;
  actors?: string;
  language?: string;
  genres?: string[];
  links?: MediaLink[];
  episodes?: MediaEpisode[];
  isSeries?: boolean;
  sourceUrl?: string;
  needsDetail?: boolean;
}

const props = defineProps<{
  item: MediaItem;
  coverSrc?: string | null;
  coverLoading?: boolean;
  busy?: string | null;
  downloadedUrls?: string[];
  downloadedHashes?: string[];
}>();

defineEmits<{
  (e: "open", item: MediaItem): void;
  (e: "download-link", item: MediaItem, link: MediaLink | null): void;
}>();

const isSeries = computed(() => !!props.item.isSeries);

const episodeCount = computed(() => {
  return props.item.episodes?.length ?? 0;
});

function isLinkDownloaded(link: MediaLink): boolean {
  if (!link) return false;
  const urls = props.downloadedUrls ?? [];
  const hashes = props.downloadedHashes ?? [];
  if (link.url && urls.includes(link.url)) return true;
  if (link.hash && hashes.includes(link.hash.toLowerCase())) return true;
  return false;
}

const anyLinkDownloaded = computed(() => {
  const urls = props.downloadedUrls ?? [];
  const hashes = props.downloadedHashes ?? [];

  // Check direct links
  if (
    props.item.links?.some((l) => {
      if (l.url && urls.includes(l.url)) return true;
      if (l.hash && hashes.includes(l.hash.toLowerCase())) return true;
      return false;
    })
  )
    return true;

  // Check episode links
  if (
    props.item.episodes?.some((ep) =>
      ep.links?.some((l) => {
        if (l.url && urls.includes(l.url)) return true;
        if (l.hash && hashes.includes(l.hash.toLowerCase())) return true;
        return false;
      }),
    )
  )
    return true;

  return false;
});

function formatRuntime(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = "none";
}
</script>

<style scoped>
.media-card {
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

.media-card[data-item-id] {
  cursor: default;
}

.media-card-top {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem;
  flex: 1;
}

.media-cover {
  flex-shrink: 0;
  width: 90px;
}

.media-poster {
  width: 90px;
  height: 130px;
  object-fit: contain;
  object-position: left center;
  display: block;
  background: var(--s-bg-muted);
  border-radius: var(--s-radius);
}

.media-poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--s-text-muted);
  font-size: 2rem;
}

.media-poster-skeleton {
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

.media-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.media-header {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.media-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--s-text);
  line-height: 1.3;

  &.is-link {
    color: var(--s-accent);
    text-decoration: none;

    &:hover {
      color: var(--s-accent-hover);
    }
  }
}

.media-year {
  font-size: 0.78rem;
  color: var(--s-text-muted);
  white-space: nowrap;
}

.media-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--s-text-secondary);
}

.media-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;

  .mdi {
    opacity: 0.7;
    font-size: 0.85rem;
  }
}

.media-star {
  color: #f5c518 !important;
  opacity: 1 !important;
}

.media-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.media-genre-tag {
  font-size: 0.72rem;
  padding: 0.1rem 0.5rem;
  border-radius: 1rem;
  background: var(--s-bg-muted);
  color: var(--s-text-muted);
  border: 1px solid var(--s-border);
}

.media-meta-small {
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

.media-actors {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-desc-inline {
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

/* Download footer */
.download-card-footer {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.75rem 0.6rem;
  border-top: 1px solid var(--s-border);
  margin-top: auto;
}

/* When single button or series, align right */
.download-card-footer:has(.ep-count-badge) {
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
}

.download-card-footer:not(:has(.torrent-row)):not(:has(.ep-count-badge)) {
  align-items: flex-end;
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

.torrent-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;

  & > :last-child {
    margin-left: auto;
  }
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
</style>
