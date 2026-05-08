<template>
  <div
    class="movie-card"
    :class="`movie-card--${details ? 'rich' : 'simple'}`"
    @mouseenter="$emit('enter')"
    @mouseleave="$emit('leave')"
  >
    <!-- Poster background (blurred backdrop) -->
    <div class="movie-card__poster" :style="posterStyle" />

    <!-- Gradient overlay (theme-aware) -->
    <div class="movie-card__overlay" />

    <!-- Content -->
    <div class="movie-card__body">
      <!-- ── Rich details card ── -->
      <template v-if="details">
        <!-- Left: text info -->
        <div class="movie-card__info">
          <!-- Header: title + year -->
          <div class="movie-card__header">
            <span class="movie-card__title">{{ details.title }}</span>
            <span v-if="details.year" class="movie-card__year">{{ details.year }}</span>
          </div>

          <!-- Meta row: rating + runtime + file size -->
          <div class="movie-card__meta-bar">
            <span
              v-if="details.rating != null"
              class="movie-card__rating"
              :title="`${details.rating}/10`"
            >
              <span class="mdi mdi-star movie-card__star-icon" />
              {{ details.rating.toFixed(1) }}
            </span>
            <span v-if="details.runtime" class="movie-card__runtime">
              <span class="mdi mdi-clock-outline" />
              {{ formatRuntime(details.runtime) }}
            </span>
            <span v-if="size" class="movie-card__filesize">
              <span class="mdi mdi-harddisk" />
              {{ size }}
            </span>
          </div>

          <!-- Genre tags -->
          <div v-if="details.genres?.length" class="movie-card__genres">
            <span
              v-for="(g, gi) in details.genres.slice(0, 4)"
              :key="gi"
              class="movie-card__genre-tag"
              >{{ g }}</span
            >
            <span
              v-if="details.genres.length > 4"
              class="movie-card__genre-tag movie-card__genre-tag--more"
            >
              +{{ details.genres.length - 4 }}
            </span>
          </div>

          <!-- Overview -->
          <p v-if="details.overview" class="movie-card__overview">
            {{ details.overview }}
          </p>

          <!-- Director -->
          <div v-if="details.director" class="movie-card__director">
            <span class="mdi mdi-account-tie" />
            {{ details.director }}
          </div>

          <!-- Cast -->
          <div v-if="details.cast?.length" class="movie-card__cast">
            <span class="mdi mdi-account-group" />
            <span v-for="(actor, ai) in details.cast" :key="ai">
              {{ actor }}<template v-if="ai < details.cast!.length - 1">,&nbsp;</template>
            </span>
          </div>

          <!-- Divider -->
          <div class="movie-card__divider" />

          <!-- Torrent info -->
          <div class="movie-card__torrent-info">
            <span v-if="category" class="movie-card__torrent-tag">
              <span class="mdi mdi-tag-outline" />
              {{ category }}
            </span>
            <div v-if="seeders != null || leechers != null" class="movie-card__torrent-stats">
              <span v-if="seeders != null" class="movie-card__stat movie-card__stat--up">
                <span class="mdi mdi-arrow-up-bold" /> {{ seeders }}
              </span>
              <span v-if="leechers != null" class="movie-card__stat movie-card__stat--down">
                <span class="mdi mdi-arrow-down-bold" /> {{ leechers }}
              </span>
            </div>
          </div>

          <!-- Source credit -->
          <span class="movie-card__source-credit">via TMDB</span>
        </div>

        <!-- Right: poster thumbnail -->
        <div v-if="cover" class="movie-card__poster-thumb" :style="posterStyle" />
      </template>

      <!-- ── Simple fallback (no details from API) ── -->
      <template v-else>
        <div class="movie-card__info">
          <div class="movie-card__header">
            <span class="movie-card__title">{{ displayName }}</span>
          </div>
          <div class="movie-card__meta-bar">
            <span v-if="category" class="movie-card__torrent-tag">{{ category }}</span>
            <span v-if="size" class="movie-card__filesize">
              <span class="mdi mdi-harddisk" />
              {{ size }}
            </span>
          </div>
          <div v-if="seeders != null || leechers != null" class="movie-card__torrent-stats">
            <span v-if="seeders != null" class="movie-card__stat movie-card__stat--up">
              <span class="mdi mdi-arrow-up-bold" /> {{ seeders }}
            </span>
            <span v-if="leechers != null" class="movie-card__stat movie-card__stat--down">
              <span class="mdi mdi-arrow-down-bold" /> {{ leechers }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CoverDetails } from "../composables/useSearchTabs";

const props = defineProps<{
  cover?: string | null;
  name?: string;
  size?: string;
  seeders?: number;
  leechers?: number;
  category?: string;
  movieDetails?: CoverDetails | null;
}>();

defineEmits<{
  enter: [];
  leave: [];
}>();

const details = computed(() => props.movieDetails ?? null);

const displayName = computed(() => {
  if (!props.name) return "";
  return props.name.length > 60 ? props.name.slice(0, 57) + "..." : props.name;
});

const posterStyle = computed(() => {
  if (props.cover) {
    return { backgroundImage: `url(${props.cover})` };
  }
  return {};
});

function formatRuntime(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
</script>

<style>
/* ═══ Base card ══════════════════════════════════════════ */
.movie-card {
  width: 420px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 0 0 1px color-mix(in srgb, var(--s-accent) 15%, transparent),
    0 0 20px color-mix(in srgb, var(--s-accent) 15%, transparent);
  animation: movie-card-in 0.2s ease-out;
  pointer-events: auto;
}

@keyframes movie-card-in {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Poster backdrop */
.movie-card__poster {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(20px) brightness(0.4);
  transform: scale(1);
}

/* Gradient overlay */
.movie-card__overlay {
  border-radius: 12px;
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--s-bg) 85%, transparent) 0%,
    color-mix(in srgb, var(--s-bg) 60%, transparent) 60%,
    color-mix(in srgb, var(--s-bg) 40%, transparent) 100%
  );
}

/* ═══ Card body: row layout (info left + poster right) ═══ */
.movie-card__body {
  position: relative;
  z-index: 1;
  padding: 16px;
  display: flex;
  flex-direction: row;
  gap: 14px;
  min-height: 200px;
}

/* Info column (left) */
.movie-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* Poster thumbnail (right) */
.movie-card__poster-thumb {
  flex-shrink: 0;
  width: 175px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  align-self: stretch;
  aspect-ratio: 2/3;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.4),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

/* Rich card minimum */
.movie-card--rich .movie-card__body {
  min-height: 210px;
}
.movie-card--rich .movie-card__poster-thumb {
  min-height: 180px;
}

/* Header: title + year */
.movie-card__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.movie-card__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.movie-card__year {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

/* Meta bar: rating + runtime + file size */
.movie-card__meta-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.8);
  flex-wrap: wrap;
}

.movie-card__meta-bar .mdi {
  font-size: 0.85rem;
  margin-right: 2px;
}

.movie-card__rating {
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  color: #f5c518;
}

.movie-card__star-icon {
  font-size: 0.9rem !important;
}

.movie-card__runtime {
  display: inline-flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
}

.movie-card__filesize {
  display: inline-flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
}

/* Genre tags */
.movie-card__genres {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 1px;
}

.movie-card__genre-tag {
  display: inline-flex;
  padding: 1px 7px;
  font-size: 0.65rem;
  font-weight: 600;
  border-radius: 10px;
  background: color-mix(in srgb, var(--s-accent) 20%, transparent);
  color: var(--s-accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid color-mix(in srgb, var(--s-accent) 30%, transparent);
}

.movie-card__genre-tag--more {
  background: color-mix(in srgb, var(--s-text-muted) 15%, transparent);
  color: rgba(255, 255, 255, 0.6);
  border-color: color-mix(in srgb, var(--s-text-muted) 20%, transparent);
}

/* Overview */
.movie-card__overview {
  font-size: 0.75rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.75);
  margin: 1px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Director */
.movie-card__director {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}

.movie-card__director .mdi {
  font-size: 0.8rem;
  opacity: 0.7;
}

/* Cast */
.movie-card__cast {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: flex-start;
  gap: 4px;
  line-height: 1.4;
}

.movie-card__cast .mdi {
  font-size: 0.8rem;
  opacity: 0.7;
  flex-shrink: 0;
  margin-top: 1px;
}

/* Divider */
.movie-card__divider {
  height: 1px;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--s-accent) 20%, transparent),
    color-mix(in srgb, var(--s-accent) 5%, transparent)
  );
  margin: 3px 0 1px;
}

/* Torrent info row */
.movie-card__torrent-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 1px;
}

.movie-card__torrent-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--s-accent) 15%, transparent);
  color: var(--s-accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.movie-card__torrent-tag .mdi {
  font-size: 0.7rem;
}

/* Torrent stats */
.movie-card__torrent-stats {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.movie-card__stat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.72rem;
  font-weight: 600;
}

.movie-card__stat .mdi {
  font-size: 0.6rem;
}

.movie-card__stat--up {
  color: var(--s-success, #22c55e);
}

.movie-card__stat--down {
  color: var(--s-danger, #ef4444);
}

/* Source credit */
.movie-card__source-credit {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: right;
  margin-top: auto;
  padding-top: 3px;
}
</style>
