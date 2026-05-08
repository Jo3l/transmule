<template>
  <div ref="coverRef" class="result-cover-wrap" :class="{ 'result-cover-wrap--fadeout': fadingOut }">
    <div
      class="result-cover"
      :class="stateClasses"
      :style="bgStyle"
      @mouseenter="onCoverEnter"
      @mouseleave="onCoverLeave"
    >
      <!-- Eye icon → idle -->
      <span v-if="state === 'idle'" class="mdi mdi-eye-outline result-cover-icon" />
      <!-- Spinner → loading -->
      <span v-else-if="state === 'loading'" class="mdi mdi-loading mdi-spin result-cover-icon" />
      <!-- Broken icon → failed -->
      <span v-else-if="state === 'failed'" class="mdi mdi-image-off-outline result-cover-icon" />
    </div>

    <!-- Movie card popover → teleported outside overflow clip -->
    <Teleport to="body">
      <div
        v-if="cardVisible"
        ref="cardRef"
        class="movie-card-portal"
        :style="cardStyle"
        @mouseenter="onCardEnter"
        @mouseleave="onCardLeave"
      >
        <MovieCard
          :cover="cover"
          :name="name"
          :size="size"
          :seeders="seeders"
          :leechers="leechers"
          :category="category"
          :movie-details="movieDetails"
          @enter="onCardEnter"
          @leave="onCardLeave"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { CoverDetails } from "../composables/useSearchTabs";

type CoverState = "idle" | "loading" | "loaded" | "failed";

const props = defineProps<{
  cover?: string | null;
  name?: string;
  size?: string;
  seeders?: number;
  leechers?: number;
  category?: string;
  movieDetails?: CoverDetails | null;
}>();

const emit = defineEmits<{
  loadCover: [];
}>();

const state = ref<CoverState>("idle");
const cardVisible = ref(false);
const coverRef = ref<HTMLElement | null>(null);
const cardRef = ref<HTMLElement | null>(null);
const cardStyle = ref<Record<string, string>>({});
const fadingOut = ref(false);
let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

// ── Fade-out on failure ─────────────────────────────────

watch(state, (s) => {
  if (s === "failed") {
    fadeTimeout = setTimeout(() => { fadingOut.value = true; }, 1000);
  } else {
    if (fadeTimeout) { clearTimeout(fadeTimeout); fadeTimeout = null; }
    fadingOut.value = false;
  }
});

onUnmounted(() => {
  if (fadeTimeout) clearTimeout(fadeTimeout);
});

// ── State machine ───────────────────────────────────────────

if (props.cover) {
  state.value = "loaded";
}

watch(
  () => props.cover,
  (newCover) => {
    if (newCover) state.value = "loaded";
  },
);

const stateClasses = computed(() => ({
  "result-cover--idle": state.value === "idle",
  "result-cover--loading": state.value === "loading",
  "result-cover--loaded": state.value === "loaded",
  "result-cover--failed": state.value === "failed",
}));

const bgStyle = computed(() => {
  if (state.value === "loaded" && props.cover) {
    return { backgroundImage: `url(${props.cover})` };
  }
  return {};
});

// ── Hover logic ─────────────────────────────────────────────

let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function onCoverEnter() {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

  if (state.value === "idle") {
    state.value = "loading";
    emit("loadCover");
    setTimeout(() => {
      if (state.value === "loading") state.value = "failed";
    }, 10000);
  } else if (state.value === "loaded") {
    // If cover exists but no movie details yet, trigger a metadata fetch
    if (props.cover && !props.movieDetails) {
      emit("loadCover");
    }
    showCard();
  }
}

function onCoverLeave() {
  if (state.value === "loaded") {
    hideTimeout = setTimeout(() => { cardVisible.value = false; }, 200);
  }
}

function onCardEnter() {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
}

function onCardLeave() {
  cardVisible.value = false;
}

function showCard() {
  if (!coverRef.value) return;
  const rect = coverRef.value.getBoundingClientRect();
  const gap = 8;
  let left = rect.right + gap;
  let top = rect.top - 80;
  const cardWidth = 420;
  const cardHeight = 280;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  if (left + cardWidth > viewportW - gap) left = rect.left - cardWidth - gap;
  if (top < gap) top = gap;
  if (top + cardHeight > viewportH - gap) top = viewportH - cardHeight - gap;
  cardStyle.value = { left: `${left}px`, top: `${top}px` };
  cardVisible.value = true;
}
</script>

<style scoped>
.result-cover-wrap {
  display: inline-flex;
  position: relative;
  transition: opacity 0.3s ease;
}

.result-cover-wrap--fadeout {
  opacity: 0;
  pointer-events: none;
}

.result-cover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  vertical-align: middle;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
}

/* ── Idle: eye placeholder ── */
.result-cover--idle {
  background: var(--s-border);
  color: var(--s-text-muted);
  border: 1px dashed var(--s-border-light);
}
.result-cover--idle:hover {
  background: color-mix(in srgb, var(--s-accent) 10%, var(--s-bg-surface));
  color: var(--s-accent);
  border-color: var(--s-accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--s-accent) 25%, transparent);
}

/* ── Loading: spinner ── */
.result-cover--loading {
  background: var(--s-bg-surface-alt);
  color: var(--s-accent);
  border: 1px solid var(--s-border);
  cursor: default;
}

/* ── Loaded: cover as background-image ── */
.result-cover--loaded {
  cursor: pointer;
  border: none;
  border-radius: 4px;
}
.result-cover--loaded:hover {
  box-shadow:
    0 0 0 2px var(--s-accent),
    0 0 12px color-mix(in srgb, var(--s-accent) 30%, transparent);
}

/* ── Failed: broken image icon ── */
.result-cover--failed {
  background: var(--s-danger-subtle);
  color: var(--s-danger);
  border: 1px dashed var(--s-border-light);
  cursor: default;
}

.result-cover-icon {
  font-size: 1rem;
  line-height: 1;
  pointer-events: none;
}
</style>

<!-- Non-scoped: applies to teleported content -->
<style>
.movie-card-portal {
  position: fixed;
  z-index: 9999;
}
</style>
