<template>
  <div class="pmc-card">
    <div class="pmc-media">
      <NuxtLink :to="detailPath" class="pmc-poster-link">
        <img
          v-if="item.poster_url"
          :src="item.poster_url"
          :alt="item.title"
          loading="lazy"
          class="pmc-poster"
        />
        <div v-else class="pmc-poster pmc-poster--fallback">
          <span class="mdi" :class="mediaIcon" />
        </div>
      </NuxtLink>
      <!-- Aviso: hay episodios emitidos recientes sin descargar (temporada en curso) -->
      <span
        v-if="attentionCount > 0"
        class="pmc-alert"
        :title="
          $t('planner.recentMissingHint', {
            count: attentionCount,
            season: item.current_season ?? '',
          })
        "
      >
        <span class="mdi mdi-bell-ring" />
        <span class="pmc-alert-count">{{ attentionCount }}</span>
      </span>
    </div>
    <div class="pmc-body">
      <NuxtLink :to="detailPath" class="pmc-title" :title="item.title">
        {{ item.title }}
      </NuxtLink>
      <div class="pmc-tags">
        <STag v-if="item.year">{{ item.year }}</STag>
        <STag v-if="item.min_quality">{{ qualityLabel(item.min_quality) }}</STag>
        <STag :variant="item.monitored ? 'success' : 'default'">
          {{ item.monitored ? $t("planner.monitored") : $t("planner.paused") }}
        </STag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CardItem {
  id: number;
  title: string;
  year?: number | null;
  poster_url?: string | null;
  min_quality?: string | null;
  monitored?: number;
  /** Episodios emitidos recientes sin descargar de la temporada en curso. */
  recent_missing_count?: number;
  current_season?: number | null;
}

const props = defineProps<{
  item: CardItem;
  mediaType: "series" | "movie";
}>();

/** Nº de episodios recientes sin descargar (solo series) → aviso en la tarjeta. */
const attentionCount = computed(() =>
  props.mediaType === "series" ? Number(props.item.recent_missing_count ?? 0) : 0,
);

const detailPath = computed(() =>
  props.mediaType === "series"
    ? `/planner/series/${props.item.id}`
    : `/planner/movies/${props.item.id}`,
);
const mediaIcon = computed(() =>
  props.mediaType === "series" ? "mdi-television-play" : "mdi-movie-open",
);

const QUALITY_LABELS: Record<string, string> = {
  uhd: "4K",
  fullhd: "1080p",
  hd: "720p",
  sd: "480p",
};
function qualityLabel(q: string): string {
  return QUALITY_LABELS[q] ?? q;
}
</script>

<style scoped>
.pmc-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--s-bg-surface, #1a1a30);
  border: 1px solid var(--s-border, #2a2a4a);
  border-radius: var(--s-radius-lg, 8px);
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.pmc-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--s-shadow-lg, 0 6px 16px rgba(0, 0, 0, 0.25));
  border-color: var(--s-accent, #22d3ee);
}
.pmc-media {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0.75rem;
  background: var(--s-bg-hover, #1a1a30);
}
.pmc-poster-link {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
}
/* Aviso de episodios recientes sin descargar (temporada en curso) */
.pmc-alert {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--s-warning, #eab308);
  background: var(--s-warning-subtle, rgba(234, 179, 8, 0.18));
  color: var(--s-warning, #eab308);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.4;
}
.pmc-alert .mdi {
  font-size: 0.85rem;
}
.pmc-alert-count {
  font-variant-numeric: tabular-nums;
}
.pmc-poster {
  width: 100%;
  max-width: 14rem;
  aspect-ratio: 2 / 3;
  object-fit: contain;
  border-radius: var(--s-radius, 4px);
  background: var(--s-bg-hover, #1a1a30);
}
.pmc-poster--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: var(--s-text-muted, #999);
}
.pmc-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1px solid var(--s-border, #2a2a4a);
}
.pmc-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--s-text, #d0d0f0);
  line-height: 1.3;
  text-decoration: none;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pmc-title:hover {
  color: var(--s-accent, #22d3ee);
}
.pmc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
</style>
