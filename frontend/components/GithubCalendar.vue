<template>
  <div v-if="days.length > 0" class="gh-calendar">
    <div class="gh-cal-header">
      <span class="gh-cal-total">
        {{ total.toLocaleString() }} {{ $t("settings.contributionsInLastYear") }}
      </span>
    </div>
    <div class="gh-cal-grid-wrap">
      <div class="gh-cal-labels">
        <span v-for="d in DAY_LABELS" :key="d" class="gh-cal-day-label">{{ d }}</span>
      </div>
      <div class="gh-cal-scroll">
        <div class="gh-cal-months">
          <span
            v-for="(ml, i) in monthLabels"
            :key="i"
            class="gh-cal-month-label"
            :style="{ gridColumn: ml.col + ' / span ' + ml.span }"
          >{{ ml.name }}</span>
        </div>
        <div class="gh-cal-grid">
          <div
            v-for="day in days"
            :key="day.date"
            class="gh-cal-cell"
            :class="'gh-cal-lvl-' + day.level"
            :title="day.date + ': ' + (day.count ?? day.level) + ' contribution' + (day.level !== 1 ? 's' : '')"
          />
        </div>
      </div>
    </div>
    <div class="gh-cal-legend">
      <span class="gh-cal-legend-label">{{ $t("settings.less") }}</span>
      <span v-for="lvl in 5" :key="lvl" class="gh-cal-legend-cell" :class="'gh-cal-lvl-' + (lvl - 1)" />
      <span class="gh-cal-legend-label">{{ $t("settings.more") }}</span>
    </div>
  </div>
  <div v-else-if="error" class="gh-cal-error">{{ error }}</div>
  <div v-else class="gh-cal-loading">
    <span class="mdi mdi-loading mdi-spin" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();

interface ContribDay { date: string; level: number; count?: number }

const days = ref<ContribDay[]>([]);
const total = ref(0);
const error = ref("");

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

const monthLabels = computed(() => {
  if (!days.value.length) return [];
  const months: Array<{ name: string; col: number; span: number }> = [];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let prevMonth = -1;
  let startCol = 1;
  let span = 0;

  for (let i = 0; i < days.value.length; i++) {
    const m = new Date(days.value[i].date + "T12:00:00").getMonth();
    if (m !== prevMonth) {
      if (prevMonth !== -1) {
        months.push({ name: MONTHS[prevMonth], col: startCol, span });
      }
      startCol = Math.floor(i / 7) + 1;
      span = 1;
    } else {
      span++;
    }
    prevMonth = m;
  }
  if (prevMonth !== -1) {
    months.push({ name: MONTHS[prevMonth], col: startCol, span });
  }
  return months;
});

onMounted(async () => {
  try {
    const data = await apiFetch<{ total: number; days: ContribDay[] }>(
      "/api/github/contributions?username=jo3l",
    );
    total.value = data.total;
    days.value = data.days;
  } catch (e: any) {
    error.value = e?.message || "Failed to load contributions";
  }
});
</script>

<style scoped>
.gh-calendar {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--s-border);
}

.gh-cal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.gh-cal-total {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--s-text-secondary);
}

.gh-cal-grid-wrap {
  display: flex;
  gap: 4px;
}

.gh-cal-labels {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 16px;
  flex-shrink: 0;
}

.gh-cal-day-label {
  width: 12px;
  height: 12px;
  font-size: 0.55rem;
  color: var(--s-text-muted);
  line-height: 12px;
  text-align: right;
}

.gh-cal-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  min-width: 0;
}

.gh-cal-months {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: auto;
  margin-bottom: 2px;
  font-size: 0.55rem;
  color: var(--s-text-muted);
  height: 14px;
  line-height: 14px;
}

.gh-cal-month-label {
  white-space: nowrap;
  overflow: hidden;
}

.gh-cal-grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 12px);
  gap: 4px;
}

.gh-cal-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  outline: 1px solid transparent;
  outline-offset: -1px;
}

.gh-cal-cell:hover {
  outline-color: var(--s-text-muted);
}

.gh-cal-lvl-0 { background: var(--s-contrib-0, color-mix(in srgb, var(--s-border) 40%, transparent)); }
.gh-cal-lvl-1 { background: var(--s-contrib-1, #0e4429); }
.gh-cal-lvl-2 { background: var(--s-contrib-2, #006d32); }
.gh-cal-lvl-3 { background: var(--s-contrib-3, #26a641); }
.gh-cal-lvl-4 { background: var(--s-contrib-4, #39d353); }

.gh-cal-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 0.4rem;
}

.gh-cal-legend-label {
  font-size: 0.6rem;
  color: var(--s-text-muted);
}

.gh-cal-legend-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.gh-cal-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  color: var(--s-text-muted);
}

.gh-cal-error {
  color: var(--s-danger);
  font-size: 0.75rem;
  padding: 0.5rem 0;
}
</style>
