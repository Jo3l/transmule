<template>
  <div class="pmc-card">
    <NuxtLink :to="detailPath" class="pmc-media">
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
}

const props = defineProps<{
  item: CardItem;
  mediaType: "series" | "movie";
}>();

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
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0.75rem;
  background: var(--s-bg-hover, #1a1a30);
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
