<template>
  <div id="comp-chunk-progress-bar" class="chunk-bar-wrapper">
    <div class="chunk-bar" :title="summaryTitle">
      <span
        v-for="(seg, i) in segments"
        :key="i"
        class="chunk-segment"
        :class="seg.cls"
        :style="seg.style"
      />
    </div>
    <div v-if="showLegend" class="chunk-legend mt-1">
      <span class="legend-item">
        <span class="legend-swatch is-complete"></span>
        {{ completeCount }} {{ $t("chunkBar.complete") }}
      </span>
      <span class="legend-item">
        <span class="legend-swatch is-available"></span>
        {{ availableCount }} {{ $t("chunkBar.available") }}
      </span>
      <span class="legend-item">
        <span class="legend-swatch is-downloading"></span>
        {{ downloadingCount }} {{ $t("chunkBar.downloading") }}
      </span>
      <span class="legend-item">
        <span class="legend-swatch is-unavailable"></span>
        {{ unavailableCount }} {{ $t("chunkBar.missing") }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();

/**
 * ChunkProgressBar — faithfully reproduces aMule's progress bar rendering.
 *
 * Status values (matching aMule's CProgressImage::CreateSpan):
 *   0 = UNAVAILABLE  → red    (gap, no sources — RGB(255, 0, 0))
 *   1 = AVAILABLE    → blue   (gap, sources exist — RGB(0, green, 255))
 *   2 = COMPLETE     → green  (no gap — downloaded)
 *   3 = DOWNLOADING  → yellow (active request — RGB(255, 208, 0))
 *
 * For AVAILABLE chunks, the blue shade varies by source count:
 *   aMule formula: green = max(0, 210 - 22*(sources - 1))
 *   → More sources = darker blue, fewer sources = lighter (more green) blue.
 */

interface Props {
  /** Array of per-chunk status values (0-3) */
  chunks: number[];
  /** Per-chunk source availability (optional — enables blue gradient) */
  availability?: number[];
  /** Show the legend below the bar */
  showLegend?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showLegend: false,
});

/**
 * Compute the aMule-style blue color for a given source availability count.
 * Matches: color = RGB(0, max(0, 210 - 22*(count-1)), 255)
 */
function availabilityColor(count: number): string {
  if (count <= 0) return "rgb(255, 0, 0)"; // red — no sources
  const green = Math.max(0, 210 - 22 * (count - 1));
  return `rgb(0, ${green}, 255)`;
}

interface Segment {
  cls: string;
  style: Record<string, string>;
}

/**
 * Collapse consecutive chunks with the same visual appearance into
 * run-length segments for efficient rendering.
 *
 * For AVAILABLE chunks, segments are grouped by availability level
 * so each gets a distinct blue shade.
 */
const segments = computed((): Segment[] => {
  const c = props.chunks;
  if (!c || c.length === 0) return [];

  const avail = props.availability;
  const total = c.length;

  // Build a key per chunk: status, plus availability for blue chunks
  const getKey = (idx: number) => {
    const s = c[idx];
    if (s === 1 && avail && avail[idx] !== undefined) {
      return `1:${avail[idx]}`;
    }
    return `${s}`;
  };

  const runs: { key: string; status: number; avail: number; count: number }[] =
    [];
  let prevKey = getKey(0);
  let count = 1;
  for (let i = 1; i < c.length; i++) {
    const k = getKey(i);
    if (k === prevKey) {
      count++;
    } else {
      runs.push({
        key: prevKey,
        status: c[i - 1],
        avail: avail?.[i - 1] ?? 0,
        count,
      });
      prevKey = k;
      count = 1;
    }
  }
  runs.push({
    key: prevKey,
    status: c[c.length - 1],
    avail: avail?.[c.length - 1] ?? 0,
    count,
  });

  const STATUS_CLASS: Record<number, string> = {
    0: "is-unavailable",
    1: "is-available",
    2: "is-complete",
    3: "is-downloading",
  };

  return runs.map((r) => {
    const style: Record<string, string> = {
      width: `${(r.count / total) * 100}%`,
    };
    // Override background for AVAILABLE chunks with per-source-count gradient
    if (r.status === 1 && avail) {
      style.background = availabilityColor(r.avail);
    }
    return {
      cls: STATUS_CLASS[r.status] || "is-unavailable",
      style,
    };
  });
});

const completeCount = computed(
  () => props.chunks?.filter((s) => s === 2).length ?? 0,
);
const availableCount = computed(
  () => props.chunks?.filter((s) => s === 1).length ?? 0,
);
const downloadingCount = computed(
  () => props.chunks?.filter((s) => s === 3).length ?? 0,
);
const unavailableCount = computed(
  () => props.chunks?.filter((s) => s === 0).length ?? 0,
);

const summaryTitle = computed(() => {
  const total = props.chunks?.length ?? 0;
  if (total === 0) return t("chunkBar.noData");
  return `${completeCount.value}/${total} ${t("chunkBar.complete")}, ${availableCount.value} ${t("chunkBar.available")}, ${downloadingCount.value} ${t("chunkBar.downloading")}, ${unavailableCount.value} ${t("chunkBar.missing")}`;
});
</script>

<style scoped>
.chunk-bar-wrapper {
  width: 100%;
}

.chunk-bar {
  display: flex;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: #444;
  border: 1px solid #555;
  cursor: help;
}

.chunk-segment {
  height: 100%;
  min-width: 0;
  transition: width 0.3s ease;
}

/* aMule colors:
   Complete  = black in aMule desktop, but green is more intuitive for web UI */
.chunk-segment.is-complete {
  background: #23d160; /* green */
}

/* Default blue — overridden per-segment when availability data exists */
.chunk-segment.is-available {
  background: #209cee; /* blue */
}

/* aMule: RGB(255, 208, 0) */
.chunk-segment.is-downloading {
  background: #ffd000; /* yellow-amber */
}

/* aMule: RGB(255, 0, 0) */
.chunk-segment.is-unavailable {
  background: #ff3860; /* red */
}

.chunk-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #888;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.legend-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend-swatch.is-complete {
  background: #23d160;
}

.legend-swatch.is-available {
  background: #209cee;
}

.legend-swatch.is-downloading {
  background: #ffd000;
}

.legend-swatch.is-unavailable {
  background: #ff3860;
}
</style>
