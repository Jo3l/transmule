<template>
  <div class="s-progress" :style="{ height: `${height}px` }">
    <div
      class="s-progress__bar"
      :style="{ width: `${clampedPct}%`, background: barColor }"
    >
      <span v-if="showText && height >= 14" class="s-progress__text"
        >{{ clampedPct }}%</span
      >
    </div>
  </div>
  <span
    v-if="showText && height < 14"
    class="s-progress-text"
    >{{ clampedPct }}%</span
  >
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    percentage?: number;
    color?: string;
    height?: number;
    showText?: boolean;
  }>(),
  {
    percentage: 0,
    height: 12,
    showText: true,
  },
);

const clampedPct = computed(() =>
  Math.min(100, Math.max(0, Math.round(props.percentage))),
);

const barColor = computed(() => {
  if (props.color) return props.color;
  if (clampedPct.value >= 100) return "var(--s-success)";
  if (clampedPct.value >= 70) return "var(--s-accent)";
  return "var(--s-info)";
});
</script>

<style scoped>
.s-progress-text {
  font-size: 0.75rem;
  margin-left: 0.35rem;
  color: var(--s-text-secondary);
}
</style>
