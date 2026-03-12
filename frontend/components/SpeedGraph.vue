<template>
  <div class="speed-graph-wrap" ref="wrapEl">
    <canvas ref="canvasEl" />
    <div class="sgg-max-label" v-if="maxLabelText">{{ maxLabelText }}</div>
    <div class="sgg-time-label">15m</div>
    <div class="sgg-legend">
      <span v-if="hasAmule" class="sgg-item sgg-amule"> <span class="sgg-dot" />aMule </span>
      <span v-if="hasTorrent" class="sgg-item sgg-torrent"> <span class="sgg-dot" />Torrent </span>
      <span v-if="hasPyload" class="sgg-item sgg-pyload"> <span class="sgg-dot" />pyLoad </span>
      <span class="sgg-item sgg-total"> <span class="sgg-dot sgg-dot--thick" />Total </span>
      <span v-if="hasUpload" class="sgg-item sgg-upload">
        <span class="sgg-dot sgg-dot--dashed" />&#8593;Upload
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  history: { t: number; amule: number; torrent: number; pyload: number; up?: number }[];
}>();

const WINDOW_MS = 15 * 60 * 1000;
const canvasEl = ref<HTMLCanvasElement | null>(null);
const maxLabelText = ref("");

const hasAmule = computed(() => props.history.some((p) => p.amule > 0));
const hasTorrent = computed(() => props.history.some((p) => p.torrent > 0));
const hasPyload = computed(() => props.history.some((p) => p.pyload > 0));
const hasUpload = computed(() => props.history.some((p) => (p.up ?? 0) > 0));

function fmtSpeed(bytes: number): string {
  if (bytes <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v < 10 ? 1 : 0) + " " + units[i];
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw() {
  const el = canvasEl.value;
  if (!el) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const W = el.clientWidth;
  const H = el.clientHeight;
  el.width = W * dpr;
  el.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const hist = props.history;

  const now = hist.length > 0 ? hist[hist.length - 1].t : Date.now();
  const windowStart = now - WINDOW_MS;

  const xOf = (t: number) => Math.max(0, ((t - windowStart) / WINDOW_MS) * W);
  // yOf is only used when we have data; define with a fallback yMax
  let maxDown = 0;
  let maxUp = 0;
  for (const pt of hist) {
    const total = pt.amule + pt.torrent + pt.pyload;
    if (total > maxDown) maxDown = total;
    if ((pt.up ?? 0) > maxUp) maxUp = pt.up ?? 0;
  }
  const maxSpeed = Math.max(maxDown, maxUp);
  const yMax = maxSpeed > 0 ? maxSpeed * 1.1 : 1;
  maxLabelText.value = maxSpeed > 0 ? fmtSpeed(maxSpeed) : "";
  const yOf = (v: number) => H - (v / yMax) * (H - 4) - 2;

  // Grid lines — always drawn
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = cssVar("--s-border") || "rgba(128,128,128,1)";
  ctx.lineWidth = 0.75;

  // Bottom baseline
  ctx.beginPath();
  ctx.moveTo(0, H - 1);
  ctx.lineTo(W, H - 1);
  ctx.stroke();

  // Horizontal: 25 / 50 / 75 % (only meaningful when we have data)
  if (maxDown > 0 || maxUp > 0) {
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = yOf(yMax * frac);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // Vertical per-minute lines
  const MS_PER_MIN = 60 * 1000;
  const firstMinute = Math.ceil(windowStart / MS_PER_MIN) * MS_PER_MIN;
  for (let tick = firstMinute; tick <= now; tick += MS_PER_MIN) {
    const x = xOf(tick);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  ctx.restore();

  // No speed lines if fewer than 2 points
  if (hist.length < 2) return;

  const colors = {
    amule: cssVar("--s-warning") || "#ff8800",
    torrent: cssVar("--s-info") || "#00aaff",
    pyload: cssVar("--s-success") || "#00cc66",
    total: cssVar("--s-accent") || "#00d4ff",
    upload: cssVar("--s-error") || "#ff4444",
  };

  function drawLine(getValue: (pt: (typeof hist)[0]) => number, color: string, lw: number) {
    ctx!.beginPath();
    ctx!.strokeStyle = color;
    ctx!.lineWidth = lw;
    ctx!.lineJoin = "round";
    ctx!.lineCap = "round";
    let first = true;
    for (const pt of hist) {
      const x = xOf(pt.t);
      const y = yOf(getValue(pt));
      if (first) {
        ctx!.moveTo(x, y);
        first = false;
      } else {
        ctx!.lineTo(x, y);
      }
    }
    ctx!.stroke();
  }

  if (hasAmule.value) drawLine((p) => p.amule, colors.amule, 1.5);
  if (hasTorrent.value) drawLine((p) => p.torrent, colors.torrent, 1.5);
  if (hasPyload.value) drawLine((p) => p.pyload, colors.pyload, 1.5);
  drawLine((p) => p.amule + p.torrent + p.pyload, colors.total, 2.5);
  if (hasUpload.value) {
    ctx!.save();
    ctx!.setLineDash([4, 3]);
    drawLine((p) => p.up ?? 0, colors.upload, 1.5);
    ctx!.restore();
  }
}

watch(() => props.history.length, draw);

let ro: ResizeObserver | null = null;
onMounted(() => {
  draw();
  ro = new ResizeObserver(draw);
  if (canvasEl.value) ro.observe(canvasEl.value);
});
onUnmounted(() => ro?.disconnect());
</script>

<style scoped>
.speed-graph-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.6rem;
}
.speed-graph-wrap canvas {
  width: 100%;
  height: 80px;
  display: block;
  border-radius: 4px;
  background: var(--s-bg-surface);
}
.sgg-max-label {
  position: absolute;
  top: 3px;
  left: 5px;
  font-size: 0.6rem;
  color: var(--s-text-muted);
  pointer-events: none;
  line-height: 1;
  opacity: 0.7;
}
.sgg-time-label {
  position: absolute;
  top: 3px;
  right: 5px;
  font-size: 0.6rem;
  color: var(--s-text-muted);
  pointer-events: none;
  line-height: 1;
  opacity: 0.7;
}
.sgg-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  margin-top: 0.3rem;
  padding: 0 2px;
}
.sgg-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  color: var(--s-text-muted);
}
.sgg-dot {
  display: inline-block;
  width: 18px;
  height: 2px;
  border-radius: 1px;
  flex-shrink: 0;
}
.sgg-dot--thick {
  height: 3px;
}
.sgg-dot--dashed {
  background: repeating-linear-gradient(
    to right,
    currentColor 0,
    currentColor 4px,
    transparent 4px,
    transparent 7px
  );
}
.sgg-amule .sgg-dot {
  background: var(--s-warning);
}
.sgg-torrent .sgg-dot {
  background: var(--s-info);
}
.sgg-pyload .sgg-dot {
  background: var(--s-success);
}
.sgg-total .sgg-dot {
  background: var(--s-accent);
}
.sgg-upload .sgg-dot {
  color: var(--s-error);
}
</style>
