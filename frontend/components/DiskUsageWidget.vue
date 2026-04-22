<template>
  <div v-if="total > 0" class="disk-usage-widget" :title="tooltip">
    <span class="mdi mdi-harddisk" />
    <span class="disk-usage-widget__label">{{ availFmt }}</span>
    <div class="disk-usage-widget__bar">
      <div
        class="disk-usage-widget__fill"
        :style="{ width: usedPercent + '%' }"
        :class="barClass"
      />
    </div>
    <span class="disk-usage-widget__pct">{{ usedPercent }}%</span>
  </div>
</template>

<script setup lang="ts">
import { formatBytes } from "~/utils/format";

const { total, avail, usedPercent } = useDiskUsage();

const availFmt = computed(() => formatBytes(avail.value));
const tooltip = computed(
  () =>
    `${formatBytes(avail.value)} free of ${formatBytes(total.value)} (${usedPercent.value}% used)`,
);
const barClass = computed(() => {
  if (usedPercent.value >= 90) return "disk-usage-widget__fill--danger";
  if (usedPercent.value >= 75) return "disk-usage-widget__fill--warning";
  return "";
});
</script>

<style scoped lang="scss">
.disk-usage-widget {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--s-text-secondary);
  white-space: nowrap;

  .mdi-harddisk {
    font-size: 0.9rem;
  }

  &__label {
    font-variant-numeric: tabular-nums;
  }

  &__bar {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--s-border);
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    border-radius: 3px;
    background: var(--s-accent);
    transition: width 0.4s ease;

    &--warning {
      background: var(--s-warning);
    }
    &--danger {
      background: var(--s-danger);
    }
  }

  &__pct {
    font-variant-numeric: tabular-nums;
    min-width: 28px;
    text-align: right;
  }
}
</style>
