<template>
  <div class="pc-calendar">
    <!-- ── Toolbar (SButton de TransMule) ─────────────────────────────────── -->
    <div class="pc-toolbar">
      <div class="pc-toolbar-left">
        <SButton
          size="sm"
          variant="default"
          icon="mdi-chevron-left"
          @click="nav(-1)"
        />
        <SButton
          size="sm"
          variant="default"
          icon="mdi-chevron-right"
          @click="nav(1)"
        />
        <SButton size="sm" variant="default" @click="goToday">
          {{ $t("planner.today") }}
        </SButton>
        <h3 class="pc-date-label">{{ monthLabel }}</h3>
      </div>
      <div class="pc-toolbar-right">
        <!-- Selector de vista -->
        <div class="pc-view-toggle">
          <SButton
            v-for="v in views"
            :key="v.id"
            size="sm"
            :variant="view === v.id ? 'primary' : 'default'"
            :icon="v.icon"
            @click="view = v.id"
          >
            {{ v.label }}
          </SButton>
        </div>
        <slot name="toolbar-right" />
      </div>
    </div>

    <!-- ── Vista mes: flexbox (como vue-simple-calendar) ──────────────────── -->
    <div v-if="view === 'month'" class="pc-calendar-body">
      <!-- Cada semana es una fila flex; cada día es una celda con su propio header -->
      <div v-for="(week, wi) in monthWeeks" :key="wi" class="pc-week">
        <div
          v-for="day in week"
          :key="day.key"
          class="pc-day"
          :class="{
            'is-outside': !day.inMonth,
            'is-today': day.isToday,
            'is-weekend': day.isWeekend,
          }"
          @click="$emit('cell-click', day)"
        >
          <!-- Day header DENTRO de la celda: nombre del día + número -->
          <div class="pc-day-header">
            <span class="pc-day-name">{{ day.weekdayLabel }}</span>
            <span class="pc-day-num" :class="{ 'is-today': day.isToday }">
              {{ day.day }}
            </span>
          </div>
          <!-- Day content: eventos -->
          <div class="pc-day-content">
            <slot name="day-events" :cell="day" :events="day.events">
              <STag
                v-for="ev in day.events"
                :key="eventKey(ev)"
                size="sm"
                class="pc-event"
                :variant="eventVariant(ev)"
                @mouseenter="onEventEnter(ev, $event)"
                @mouseleave="onEventLeave(ev)"
                @click.stop="$emit('event-click', ev)"
              >
                <span v-if="eventIcon(ev)" class="mdi pc-event-icon" :class="eventIcon(ev)" />
                <span class="pc-event-text">{{ ev.title }}</span>
              </STag>
            </slot>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Vista semana ──────────────────────────────────────────────────── -->
    <div v-else-if="view === 'week'" class="pc-calendar-body">
      <!-- Mobile: un solo día navegable -->
      <template v-if="isMobile">
        <div class="pc-mobile-day-nav">
          <SButton
            size="sm"
            variant="default"
            icon="mdi-chevron-left"
            :disabled="mobileDayIdx <= 0"
            @click="mobileNav(-1)"
          />
          <div class="pc-mobile-day-label">
            <span class="pc-mobile-day-weekday">{{ mobileDay.weekdayLabel }}</span>
            <span class="pc-mobile-day-date">{{ mobileDayLabel }}</span>
          </div>
          <SButton
            size="sm"
            variant="default"
            icon="mdi-chevron-right"
            :disabled="mobileDayIdx >= weekDays.length - 1"
            @click="mobileNav(1)"
          />
        </div>
        <div
          class="pc-day pc-day--mobile"
          :class="{
            'is-today': mobileDay.isToday,
            'is-weekend': mobileDay.isWeekend,
          }"
          @click="$emit('cell-click', mobileDay)"
        >
          <div class="pc-day-content">
            <slot name="day-events" :cell="mobileDay" :events="mobileDay.events">
              <STag
                v-for="ev in mobileDay.events"
                :key="eventKey(ev)"
                size="sm"
                class="pc-event"
                :variant="eventVariant(ev)"
                @click.stop="$emit('event-click', ev)"
              >
                <span v-if="eventIcon(ev)" class="mdi pc-event-icon" :class="eventIcon(ev)" />
                <span class="pc-event-text">{{ ev.title }}</span>
              </STag>
            </slot>
          </div>
        </div>
      </template>
      <!-- Desktop/tablet: semana completa -->
      <div v-else class="pc-week pc-week--tall">
        <div
          v-for="day in weekDays"
          :key="day.key"
          class="pc-day"
          :class="{
            'is-outside': !day.inMonth,
            'is-today': day.isToday,
            'is-weekend': day.isWeekend,
          }"
          @click="$emit('cell-click', day)"
        >
          <div class="pc-day-header">
            <span class="pc-day-name">{{ day.weekdayLabel }}</span>
            <span class="pc-day-num" :class="{ 'is-today': day.isToday }">
              {{ day.day }}
            </span>
          </div>
          <div class="pc-day-content">
            <slot name="day-events" :cell="day" :events="day.events">
              <STag
                v-for="ev in day.events"
                :key="eventKey(ev)"
                size="sm"
                class="pc-event"
                :variant="eventVariant(ev)"
                @mouseenter="onEventEnter(ev, $event)"
                @mouseleave="onEventLeave(ev)"
                @click.stop="$emit('event-click', ev)"
              >
                <span v-if="eventIcon(ev)" class="mdi pc-event-icon" :class="eventIcon(ev)" />
                <span class="pc-event-text">{{ ev.title }}</span>
              </STag>
            </slot>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Vacío ─────────────────────────────────────────────────────────── -->
    <div v-if="!loading && allEvents.length === 0" class="box has-text-centered">
      <p><span class="mdi mdi-calendar-blank-outline is-size-2 has-text-grey-light" /></p>
      <p class="has-text-grey">{{ $t("planner.noUpcoming") }}</p>
    </div>

    <!-- ── Popover hover: MovieCard (la misma del buscador general) ────────── -->
    <Teleport to="body">
      <div
        v-if="hoverCard.visible"
        class="pc-hover-card"
        :style="hoverCard.style"
        @mouseenter="cancelHide()"
        @mouseleave="scheduleHide()"
      >
        <MovieCard
          :cover="hoverCard.cover"
          :name="hoverCard.name"
          :movie-details="hoverCard.details"
          @enter="cancelHide()"
          @leave="scheduleHide()"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * PlannerCalendar — calendario mensual/semanal reimaginado a partir de
 * richardtallent/vue-simple-calendar (MIT).
 *
 * Patrones tomados de vue-simple-calendar:
 *   - Layout flexbox puro: .pc-week (fila flex) → .pc-day (celda flex:1)
 *   - El header del día (nombre + número) vive DENTRO de cada celda,
 *     garantizando alineación perfecta entre días de la semana y columnas.
 *   - Los días de meses adyacentes se muestran atenuados (is-outside).
 *   - Todos los botones usan SButton y los eventos STag (componentes de TransMule).
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    events?: any[];
    loading?: boolean;
    /** { year, month } — month 1-12 */
    month?: { year: number; month: number };
    views?: { id: string; label: string; icon: string }[];
  }>(),
  {
    events: () => [],
    loading: false,
    month: () => {
      const n = new Date();
      return { year: n.getFullYear(), month: n.getMonth() + 1 };
    },
    views: () => [
      { id: "week", label: "Semana", icon: "mdi-calendar-week" },
      { id: "month", label: "Mes", icon: "mdi-calendar-month-outline" },
    ],
  },
);

const emit = defineEmits<{
  "update:month": [val: { year: number; month: number }];
  "event-click": [event: any];
  "cell-click": [cell: any];
}>();

const view = ref("week");

// ── Responsive: en mobile se muestra un solo día navegable ─────────────────
const isMobile = ref(false);
/** Índice del día visible en mobile (0-6, dentro de la semana visible) */
const mobileDayIdx = ref(0);

function checkMobile() {
  isMobile.value = window.matchMedia("(max-width: 768px)").matches;
}

/** Día visible en mobile (de la semana visible) */
const mobileDay = computed(() => {
  const days = weekDays.value;
  const idx = Math.min(mobileDayIdx.value, Math.max(days.length - 1, 0));
  return days[idx];
});

/** Label del día visible en mobile: "Lun 16 · agosto" */
const mobileDayLabel = computed(() => {
  const d = mobileDay.value;
  if (!d?.date) return "";
  const dt = new Date(`${d.date}T00:00:00`);
  const wd = dt.toLocaleDateString(undefined, { weekday: "long" });
  const dm = dt.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${dm}`;
});

function mobileNav(dir: 1 | -1) {
  const max = weekDays.value.length - 1;
  mobileDayIdx.value = Math.min(Math.max(mobileDayIdx.value + dir, 0), max);
}

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKEND_INDEXES = new Set([5, 6]); // sábado, domingo (lunes=0)

const monthLabel = computed(() => {
  const d = new Date(props.month.year, props.month.month - 1, 1);
  const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const todayStr = new Date().toISOString().slice(0, 10);

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const allEvents = computed(() => props.events ?? []);

const eventsByDate = computed(() => {
  const m = new Map<string, any[]>();
  for (const ev of allEvents.value) {
    if (!ev?.date) continue;
    const list = m.get(ev.date) ?? [];
    list.push(ev);
    m.set(ev.date, list);
  }
  return m;
});

function buildDay(year: number, month: number, day: number, key: string) {
  const d = new Date(year, month - 1, day);
  const ds = dateStr(year, month, day);
  const weekdayIdx = (d.getDay() + 6) % 7; // lunes=0
  return {
    key,
    day,
    date: ds,
    inMonth: d.getMonth() + 1 === month,
    isToday: ds === todayStr,
    isWeekend: WEEKEND_INDEXES.has(weekdayIdx),
    weekdayLabel: WEEKDAY_LABELS[weekdayIdx],
    events: eventsByDate.value.get(ds) ?? [],
  };
}

/** Semanas del mes: filas flex de 7 días (días adyacentes atenuados) */
const monthWeeks = computed(() => {
  const { year, month } = props.month;
  const first = new Date(year, month - 1, 1);
  const firstWeekdayIdx = (first.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month, 0).getDate();

  // Grid empieza en lunes de la semana del día 1
  const start = new Date(year, month - 1, 1 - firstWeekdayIdx);
  const weeks: any[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      week.push(
        buildDay(d.getFullYear(), d.getMonth() + 1, d.getDate(), `w${w}-d${i}`),
      );
    }
    weeks.push(week);
  }
  return weeks;
});

/** Semana visible (vista semana): la semana de hoy si es el mes actual,
 *  si no, la que contiene el día 1 del mes visible. */
const weekDays = computed(() => {
  const { year, month } = props.month;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const anchor = isCurrentMonth ? now : new Date(year, month - 1, 1);
  const mondayIdx = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayIdx);
  const out: any[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push(
      buildDay(d.getFullYear(), d.getMonth() + 1, d.getDate(), `wd-${i}`),
    );
  }
  return out;
});

function nav(dir: 1 | -1) {
  const { year, month } = props.month;
  let ny = year;
  let nm = month + dir;
  if (nm < 1) { nm = 12; ny--; }
  if (nm > 12) { nm = 1; ny++; }
  mobileDayIdx.value = 0;
  emit("update:month", { year: ny, month: nm });
}

function goToday() {
  const n = new Date();
  mobileDayIdx.value = 0;
  emit("update:month", { year: n.getFullYear(), month: n.getMonth() + 1 });
}

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", checkMobile);
});

// ── Helpers de eventos ──────────────────────────────────────────────────────

function eventKey(ev: any): string {
  return `${ev.date}-${ev.kind ?? "ev"}-${ev.title}-${ev.subscription_id ?? ""}`;
}
function eventIcon(ev: any): string {
  if (ev.kind === "episode") return "mdi-television-play";
  if (ev.kind === "movie") return "mdi-movie-open";
  if (ev.kind === "discover-movie") return "mdi-movie-open-outline";
  if (ev.kind === "discover-tv") return "mdi-television-guide";
  return "";
}
/** Mapea evento → variant de STag de TransMule */
function eventVariant(ev: any): any {
  if (!ev.is_subscribed) return "default";
  switch (ev.status) {
    case "wanted": return "warning";
    case "grabbed": return "info";
    case "downloaded": return "success";
    case "failed": return "danger";
    default: return "primary"; // unreleased / released / available
  }
}

// ── Hover popover (MovieCard, como el buscador general) ────────────────────

const hoverCard = ref<{
  visible: boolean;
  style: Record<string, string>;
  cover: string | null;
  name: string;
  details: any;
}>({ visible: false, style: {}, cover: null, name: "", details: null });

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let hoveredEvent: any = null;

function onEventEnter(ev: any, e: MouseEvent) {
  hoveredEvent = ev;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const gap = 8;
  const cardW = 420;
  const cardH = 300;
  let left = rect.right + gap;
  let top = rect.top - 60;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left + cardW > vw - gap) left = rect.left - cardW - gap;
  if (left < gap) left = gap;
  if (top < gap) top = gap;
  if (top + cardH > vh - gap) top = vh - cardH - gap;

  hoverCard.value = {
    visible: true,
    style: { left: `${left}px`, top: `${top}px` },
    cover: ev.poster_url ?? null,
    name: ev.title ?? "",
    details: {
      title: ev.title ?? "",
      year: ev.date ? ev.date.slice(0, 4) : undefined,
      rating: ev.vote_average ?? undefined,
      overview: ev.subtitle ?? undefined,
    },
  };
}

function onEventLeave(_ev: any) {
  scheduleHide();
}

function scheduleHide() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hoverCard.value.visible = false;
    hoveredEvent = null;
  }, 200);
}

function cancelHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}
</script>

<style scoped>
/* ── Contenedor ──────────────────────────────────────────────────────────── */
.pc-calendar {
  display: block;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.pc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pc-toolbar-left,
.pc-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pc-date-label {
  margin: 0 0 0 4px;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--s-text, #d0d0f0);
  text-transform: capitalize;
}
.pc-view-toggle {
  display: flex;
  gap: 4px;
}

/* ── Cuerpo: flexbox puro (como vue-simple-calendar) ─────────────────────── */
.pc-calendar-body {
  border: 1px solid var(--s-border, #2a2a4a);
  border-radius: var(--s-radius-lg, 8px);
  overflow: hidden;
  background: var(--s-bg-surface, #101020);
}
/* Cada semana es una fila flex */
.pc-week {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
}
.pc-week + .pc-week {
  border-top: 1px solid var(--s-border, #2a2a4a);
}
.pc-week--tall .pc-day {
  min-height: 380px;
}
/* Cada día es una celda flex 1fr — alineación garantizada */
.pc-day {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--s-border, #2a2a4a);
  min-height: 104px;
  padding: 6px;
  gap: 4px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.pc-day:last-child {
  border-right: none;
}
.pc-day:hover {
  background: var(--s-bg-hover, #1a1a30);
}
.pc-day.is-outside {
  background: var(--s-bg-surface-alt, #12122a);
  opacity: 0.5;
}
.pc-day.is-weekend:not(.is-outside) {
  background: var(--s-bg-hover, rgba(0, 0, 0, 0.15));
}
.pc-day.is-today {
  box-shadow: inset 0 0 0 2px var(--s-accent, #00d4ff);
}

/* ── Day header (dentro de la celda) ─────────────────────────────────────── */
.pc-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
}
.pc-day-name {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--s-text-muted, #555);
}
.pc-day.is-weekend .pc-day-name {
  color: var(--s-text-secondary, #888);
}
.pc-day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--s-text, #d0d0f0);
}

/* ── Mobile: día único navegable ─────────────────────────────────────────── */
.pc-mobile-day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--s-border, #2a2a4a);
  background: var(--s-table-header-bg, #0d0d1c);
}
.pc-mobile-day-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.pc-mobile-day-weekday {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--s-text-muted, #555);
}
.pc-mobile-day-date {
  font-size: 1rem;
  font-weight: 600;
  color: var(--s-text, #d0d0f0);
  text-transform: capitalize;
}
.pc-day--mobile {
  min-height: 65vh;
  border: none;
  padding: 12px;
}

/* ── Day content: eventos ────────────────────────────────────────────────── */
.pc-day-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
  flex: 1;
}
/* Eventos como STag — text overflow para no romper el grid */
.pc-event {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  cursor: pointer;
}
.pc-event-icon {
  font-size: 0.72rem;
  flex-shrink: 0;
}
.pc-event-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Popover hover (MovieCard) ───────────────────────────────────────────── */
.pc-hover-card {
  position: fixed;
  z-index: 9999;
  width: 420px;
  box-shadow: var(--s-shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.6));
  border-radius: var(--s-radius-lg, 8px);
  overflow: hidden;
}
</style>
