<template>
  <div ref="coverRef" class="result-cover-wrap">
    <div
      class="result-cover"
      :class="stateClasses"
      :style="bgStyle"
      @mouseenter="onCoverEnter"
      @mouseleave="onCoverLeave"
    >
      <!-- Idle: eye icon as CTA to load cover (only rendered for video files) -->
      <span v-if="state === 'idle'" class="mdi mdi-eye-outline result-cover-icon" />
      <!-- Spinner → loading -->
      <span v-else-if="state === 'loading'" class="mdi mdi-loading mdi-spin result-cover-icon" />
      <!-- File-type icon → failed (cover fetch failed) -->
      <span v-else-if="state === 'failed'" :class="['mdi result-cover-icon', fileIcon]" />
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
import { nextTick } from "vue";
import { detectFileIcon } from "../composables/useSearchTabs";
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
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let _hovered = false;

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

/** When a result has a native cover but no movieDetails yet (e.g. TorrentClaw),
 *  we transition to "loading" on hover to wait for metadata.  Once movieDetails
 *  arrive, go back to "loaded" and show the card if the user is still hovering. */
watch(() => props.movieDetails, (details) => {
  if (details && state.value === "loading") {
    state.value = "loaded";
    if (_hovered) {
      nextTick(() => showCard());
    }
  }
});

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

const fileIcon = computed(() => {
  const icon = detectFileIcon(props.name);
  // If name has no recognizable extension (e.g. TorrentClaw clean titles),
  // fall back to category: Movies/TV Shows → video icon
  if (icon === "mdi-file" && (props.category === "Movies" || props.category === "TV Shows")) {
    return "mdi-file-video";
  }
  return icon;
});

// ── Hover logic ─────────────────────────────────────────────

function onCoverEnter() {
  _hovered = true;
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

  if (state.value === "idle") {
    state.value = "loading";
    emit("loadCover");
    setTimeout(() => {
      if (state.value === "loading") state.value = "failed";
    }, 10000);
  } else if (state.value === "loaded") {
    if (props.cover && !props.movieDetails) {
      // Native cover (e.g. TorrentClaw) but no metadata yet —
      // show spinner until movieDetails arrive, don't show card yet.
      state.value = "loading";
      emit("loadCover");
      setTimeout(() => {
        if (state.value === "loading") state.value = "failed";
      }, 10000);
      return;
    }
    showCard();
  }
}

function onCoverLeave() {
  _hovered = false;
  if (state.value === "loaded" || state.value === "loading") {
    hideTimeout = setTimeout(() => { cardVisible.value = false; }, 200);
  }
}

function onCardEnter() {
  _hovered = true;
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
}

function onCardLeave() {
  _hovered = false;
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

/* ── Idle: eye icon placeholder (CTA to load cover) ── */
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

/* ── Failed: file-type icon (subtle, no cover available) ── */
.result-cover--failed {
  background: var(--s-bg-surface-alt);
  color: var(--s-text-muted);
  border: 1px solid var(--s-border);
  font-size: 1.1rem;
  cursor: default;
}

.result-cover-icon {
  font-size: 1rem;
  line-height: 1;
  pointer-events: none;
}
</style>

<!-- Non-scoped: applies to teleported content and search-page placeholders -->
<style>
.movie-card-portal {
  position: fixed;
  z-index: 9999;
}
/* Reusable file-type icon placeholder for search tables */
.result-cover-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  vertical-align: middle;
  background: var(--s-border);
  color: var(--s-text-muted);
  border: 1px dashed var(--s-border-light);
  font-size: 1.1rem;
}
</style>
