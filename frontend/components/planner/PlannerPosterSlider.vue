<template>
  <div class="pps">
    <button
      v-if="canScrollLeft"
      class="pps-arrow pps-arrow--left"
      :aria-label="$t('planner.scrollLeft')"
      @click="scrollBy(-1)"
    >
      <span class="mdi mdi-chevron-left" />
    </button>

    <div ref="trackRef" class="pps-track" @scroll="onScroll">
      <button
        v-for="item in items"
        :key="`${item.media_type}-${item.id}`"
        class="pps-card"
        :title="item.title"
        @click="emit('select', item)"
      >
        <div class="pps-poster">
          <img
            v-if="item.poster_url"
            :src="item.poster_url"
            :alt="item.title"
            loading="lazy"
            class="pps-img"
          />
          <div v-else class="pps-img pps-fallback">
            <span class="mdi" :class="fallbackIcon" />
          </div>
          <span v-if="item.vote_average != null" class="pps-rating">
            <span class="mdi mdi-star" />{{ ratingText(item.vote_average) }}
          </span>
        </div>
        <div class="pps-title">{{ item.title }}</div>
      </button>
    </div>

    <button
      v-if="canScrollRight"
      class="pps-arrow pps-arrow--right"
      :aria-label="$t('planner.scrollRight')"
      @click="scrollBy(1)"
    >
      <span class="mdi mdi-chevron-right" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { TmdbPopularItem } from "~/composables/usePlanner";

const props = withDefaults(
  defineProps<{
    items: TmdbPopularItem[];
    mediaType?: "series" | "movie";
  }>(),
  { mediaType: "series" },
);

const emit = defineEmits<{ select: [item: TmdbPopularItem] }>();

const trackRef = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

const fallbackIcon = computed(() =>
  props.mediaType === "movie" ? "mdi-movie-open" : "mdi-television-play",
);

function ratingText(v: number): string {
  return v.toFixed(1);
}

function updateArrows() {
  const el = trackRef.value;
  if (!el) return;
  canScrollLeft.value = el.scrollLeft > 4;
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

/** Desplaza ~3 pósters por pulsación (ancho de tarjeta + gap). */
function scrollBy(dir: number) {
  const el = trackRef.value;
  if (!el) return;
  const card = el.querySelector<HTMLElement>(".pps-card");
  const w = card ? card.offsetWidth + 16 : 220;
  el.scrollBy({ left: dir * w * 3, behavior: "smooth" });
}

function onScroll() {
  updateArrows();
}

onMounted(() => {
  updateArrows();
  window.addEventListener("resize", updateArrows);
});

onUnmounted(() => window.removeEventListener("resize", updateArrows));

watch(
  () => props.items,
  () => nextTick(updateArrows),
  { deep: true },
);
</script>

<style scoped>
.pps {
  position: relative;
  display: flex;
  align-items: stretch;
}
.pps-track {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-behavior: smooth;
  padding: 4px 2px 8px;
  scrollbar-width: none;
}
.pps-track::-webkit-scrollbar {
  display: none;
}
.pps-card {
  flex: 0 0 auto;
  width: 150px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: inherit;
}
.pps-poster {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--s-radius-lg, 8px);
  overflow: hidden;
  background: var(--s-bg-hover, #1a1a30);
  border: 1px solid var(--s-border, #2a2a4a);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.pps-card:hover .pps-poster {
  transform: translateY(-3px);
  border-color: var(--s-accent, #22d3ee);
  box-shadow: var(--s-shadow-lg, 0 6px 16px rgba(0, 0, 0, 0.25));
}
.pps-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pps-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  color: var(--s-text-muted, #999);
}
.pps-rating {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #000;
  background: rgba(255, 215, 0, 0.92);
}
.pps-rating .mdi {
  font-size: 0.8rem;
}
.pps-title {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--s-text, #d0d0f0);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pps-arrow {
  flex: 0 0 auto;
  align-self: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--s-border, #2a2a4a);
  background: var(--s-bg-surface, #1a1a30);
  color: var(--s-text, #d0d0f0);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.pps-arrow:hover {
  border-color: var(--s-accent, #22d3ee);
  color: var(--s-accent, #22d3ee);
}
.pps-arrow--left {
  margin-right: 8px;
}
.pps-arrow--right {
  margin-left: 8px;
}
</style>
