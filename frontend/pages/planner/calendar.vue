<template>
  <SLoading id="page-planner-calendar" :loading="loading">
    <div class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">
            <span class="mdi mdi-calendar-month-outline mr-2" />{{ $t("planner.calendar") }}
          </h2>
        </div>
        <div class="level-right">
          <div class="is-flex is-align-items-center">
            <span class="is-size-7 has-text-grey mr-2">{{ $t("planner.calFilter") }}</span>
            <SSelect
              v-model="tvFilter"
              :options="tvFilterOptions"
              :disabled="!discover"
              @update:model-value="load"
            />
            <span class="is-size-7 has-text-grey ml-3 mr-2">{{ $t("planner.discoverToggle") }}</span>
            <SSwitch v-model="discover" @update:model-value="load" />
          </div>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <!-- Componente de calendario (inspirado en vue-simple-calendar) -->
      <PlannerCalendar
        v-model:month="viewMonth"
        :events="events"
        :loading="loading"
        @update:month="onMonthChange"
        @event-click="onEventClick"
      >
        <!-- Leyenda en el toolbar -->
        <template #toolbar-right>
          <div class="calendar-legend">
            <span class="legend-item">
              <span class="legend-dot legend-subscribed" /> {{ $t("planner.subscribed") }}
            </span>
            <span class="legend-item">
              <span class="legend-dot legend-discover" /> {{ $t("planner.discoverOnly") }}
            </span>
          </div>
        </template>
      </PlannerCalendar>

      <!-- Modal suscripción directa desde calendario -->
      <PlannerAddMediaDialog
        v-model="showAddModal"
        :media-type="addMediaType"
        :initial-result="addInitialResult"
        @added="onAdded"
      />
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();

const loading = ref(true);
const errorMsg = ref("");
const events = ref<any[]>([]);
const discover = ref(true);

// Filtro de categorías del descubrimiento (TVmaze show.type). Por defecto solo
// series de ficción (Scripted + Animation); "all" muestra también realities,
// talk shows, noticias, deportes, concursos, etc.
const tvFilter = ref("Scripted,Animation");
const tvFilterOptions = computed(() => [
  { label: t("planner.calFilterFiction"), value: "Scripted,Animation" },
  { label: t("planner.calFilterAll"), value: "all" },
]);

// Fecha visible (month 1-12)
const viewMonth = ref({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const monthStr = `${viewMonth.value.year}-${String(viewMonth.value.month).padStart(2, "0")}`;
    const res = await apiFetch<{ events: any[]; tmdb: boolean }>(
      `/api/planner/calendar?month=${monthStr}&discover=${discover.value ? "1" : "0"}&types=${encodeURIComponent(tvFilter.value)}`,
    );
    events.value = res.events ?? [];
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    loading.value = false;
  }
}

/** El componente navegó de mes → recargar */
function onMonthChange() {
  load();
}

const showAddModal = ref(false);
const addMediaType = ref<"series" | "movie">("series");
const addInitialResult = ref<any>(null);

/** Click en evento: suscrito → detalle; descubrimiento → modal para suscribirse */
function onEventClick(ev: any) {
  if (ev.is_subscribed) {
    if (ev.subscription_type === "movie") {
      navigateTo(`/planner/movies/${ev.subscription_id}`);
    } else if (ev.subscription_id) {
      navigateTo(`/planner/series/${ev.subscription_id}`);
    }
    return;
  }
  // Evento de descubrimiento → abrir modal con el objetivo directo
  addMediaType.value = ev.media_type === "tv" ? "series" : "movie";
  addInitialResult.value = ev;
  showAddModal.value = true;
}

function onAdded(subId: number) {
  showAddModal.value = false;
  addInitialResult.value = null;
  if (addMediaType.value === "movie") {
    navigateTo(`/planner/movies/${subId}`);
  } else {
    navigateTo(`/planner/series/${subId}`);
  }
}

onMounted(load);
</script>

<style scoped>
.calendar-legend {
  display: flex;
  gap: 14px;
  align-items: center;
  font-size: 0.78rem;
  color: var(--s-text-muted, #777);
  margin-left: 4px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.legend-subscribed {
  background: var(--s-accent, #00d4ff);
}
.legend-discover {
  background: var(--s-border, #2a2a4a);
}
</style>
