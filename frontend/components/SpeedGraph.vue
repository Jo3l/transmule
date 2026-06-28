<template>
  <div class="speed-graph-wrap" ref="wrapEl">
    <canvas ref="canvasEl" />
    <div class="sgg-max-label" v-if="maxLabelText">{{ maxLabelText }}</div>
    <div class="sgg-time-label">15m</div>
    <div class="sgg-legend">
      <span class="sgg-item sgg-total"> <span class="sgg-dot sgg-dot--thick" />Descarga </span>
      <span v-if="hasUpload" class="sgg-item sgg-upload">
        <span class="sgg-dot sgg-dot--dashed" />&#8593;Subida
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  history: { t: number; amule: number; torrent: number; pyload: number; slskd: number; up?: number }[];
}>();

const WINDOW_MS = 15 * 60 * 1000;
const canvasEl = ref<HTMLCanvasElement | null>(null);
const maxLabelText = ref("");

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

  // Find max speeds from data
  let maxDown = 0;
  let maxUp = 0;
  for (const pt of hist) {
    const total = pt.amule + pt.torrent + pt.pyload + pt.slskd;
    if (total > maxDown) maxDown = total;
    if ((pt.up ?? 0) > maxUp) maxUp = pt.up ?? 0;
  }

  const MIN_SCALE_BPS = 12_500_000; // 100 Mbps minimum scale in bytes/s
  const maxSpeed = Math.max(maxDown, maxUp);
  const yMax = Math.max(maxSpeed * 1.1, MIN_SCALE_BPS);
  maxLabelText.value = fmtSpeed(Math.max(maxSpeed, MIN_SCALE_BPS));
  const yOf = (v: number) => H - (v / yMax) * (H - 4) - 2;

  // Grid lines
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = cssVar("--s-border") || "rgba(128,128,128,1)";
  ctx.lineWidth = 0.75;

  // Bottom baseline
  ctx.beginPath();
  ctx.moveTo(0, H - 1);
  ctx.lineTo(W, H - 1);
  ctx.stroke();

  // Horizontal: 25 / 50 / 75 %
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

  if (hist.length < 2) return;

  function drawLine(getValue: (pt: (typeof hist)[0]) => number, color: string, lw: number, dashed = false) {
    ctx!.beginPath();
    ctx!.strokeStyle = color;
    ctx!.lineWidth = lw;
    ctx!.lineJoin = "round";
    ctx!.lineCap = "round";
    if (dashed) ctx!.setLineDash([4, 3]);
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
    if (dashed) ctx!.setLineDash([]);
  }

  // Total download line (sum of all services)
  drawLine((p) => p.amule + p.torrent + p.pyload + p.slskd, cssVar("--s-accent") || "#00d4ff", 2.5);

  // Upload line (dashed)
  if (hasUpload.value) {
    drawLine((p) => p.up ?? 0, cssVar("--s-error") || "#ff4444", 1.5, true);
  }
}

const resizeObserver = new ResizeObserver(() => draw.call(undefined));

onMounted(() => {
  if (canvasEl.value?.parentElement) {
    resizeObserver.observe(canvasEl.value.parentElement);
  }
});

defineExpose({ draw });

onUnmounted(() => {
  resizeObserver.disconnect();
});
</script>

<style scoped>
.speed-graph-wrap {
  position: relative;
  width: 100%;
  height: 90px;
  overflow: hidden;
}
.speed-graph-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.sgg-max-label {
  position: absolute;
  top: 1px;
  right: 6px;
  font-size: 0.6rem;
  color: var(--s-text-muted);
  line-height: 1;
}
.sgg-time-label {
  position: absolute;
  bottom: 1px;
  right: 6px;
  font-size: 0.55rem;
  color: var(--s-text-muted);
  line-height: 1;
}
.sgg-legend {
  position: absolute;
  bottom: 1px;
  left: 6px;
  display: flex;
  gap: 0.6rem;
  font-size: 0.65rem;
  color: var(--s-text-secondary);
  line-height: 1;
  flex-wrap: wrap;
}
.sgg-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.sgg-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.sgg-total .sgg-dot {
  background: var(--s-accent, #00d4ff);
  width: 9px;
  height: 3px;
  border-radius: 2px;
}
.sgg-upload .sgg-dot {
  background: transparent;
  border: 1px dashed var(--s-error, #ff4444);
  width: 7px;
  height: 7px;
}
</style>
