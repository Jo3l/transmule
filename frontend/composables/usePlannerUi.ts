/**
 * Helpers de UI compartidos del planificador.
 *
 * Extraídos de las páginas para evitar la duplicación de:
 *   - mapeo estado → etiqueta i18n (`STATUS_LABELS` + `statusLabel`)
 *   - mapeo estado → variant de STag (`statusClass`)
 *   - `pad` (SxxExx)
 *   - `formatDate` (fecha YYYY-MM-DD → locale)
 *   - historial unificado (búsquedas + descargas)
 */

const PLANNER_STATUS_LABELS: Record<string, string> = {
  unreleased: "planner.statusUnreleased",
  released: "planner.statusReleased",
  waiting: "planner.statusWaiting",
  grabbed: "planner.statusGrabbed",
  downloaded: "planner.statusDownloaded",
  cutoff_unmet: "planner.statusCutoff",
  failed: "planner.statusFailed",
};

export type PlannerTagVariant = "default" | "success" | "warning" | "danger" | "info";

/** Mapea un estado de episodio/película al variant de STag. */
export function plannerStatusClass(s: string): PlannerTagVariant {
  if (s === "downloaded") return "success";
  if (s === "failed") return "danger";
  if (s === "cutoff_unmet") return "warning";
  if (s === "waiting" || s === "released" || s === "grabbed") return "info";
  return "default";
}

/** Formatea número de episodio/temporada a 2 dígitos (S01E01). */
export function padEpisode(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formatea una fecha (YYYY-MM-DD o ISO) al locale indicado.
 * Sin locale usa el locale por defecto del navegador.
 */
export function formatPlannerDate(dateStr: string | null, locale?: string): string {
  if (!dateStr) return "—";
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = isoDate
    ? new Date(
        Number(dateStr.slice(0, 4)),
        Number(dateStr.slice(5, 7)) - 1,
        Number(dateStr.slice(8, 10)),
      )
    : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  try {
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d.toLocaleDateString();
  }
}

/** Etiqueta y variant de estado, con i18n reactiva. */
export function usePlannerStatusDisplay() {
  const { t } = useI18n();
  const statusLabel = (s: string): string =>
    t(PLANNER_STATUS_LABELS[s] ?? "planner.statusUnknown");
  return { statusLabel, statusClass: plannerStatusClass };
}

// ─── Historial unificado (búsquedas + descargas) ─────────────────────────────

const HISTORY_EVENT_LABELS: Record<string, string> = {
  queued: "planner.historyEventQueued",
  dispatched: "planner.historyEventDispatched",
  dispatch_failed: "planner.historyEventDispatchFailed",
  requeued: "planner.historyEventRequeued",
  completed: "planner.historyEventCompleted",
  gave_up: "planner.historyEventGaveUp",
  stuck_recovered: "planner.historyEventStuckRecovered",
  postprocess_moved: "planner.historyEventPostprocessMoved",
  postprocess_failed: "planner.historyEventPostprocessFailed",
  postprocess_plex: "planner.historyEventPostprocessPlex",
  postprocess_located: "planner.historyEventPostprocessLocated",
  postprocess_renamed: "planner.historyEventPostprocessRenamed",
  postprocess_move_queued: "planner.historyEventPostprocessMoveQueued",
};

/**
 * Presentación del historial unificado (search + grab) devuelto por
 * GET /api/planner/subscriptions/:id/history. Cada entrada lleva `kind`.
 */
export function usePlannerHistoryDisplay() {
  const { t } = useI18n();

  const kindLabel = (kind: string): string =>
    kind === "grab" ? t("planner.historyKindGrab") : t("planner.historyKindSearch");

  const eventLabel = (row: any): string => {
    if (row.kind === "grab") {
      return t(HISTORY_EVENT_LABELS[row.event] ?? "planner.statusUnknown");
    }
    if (row.status === "grabbed") return t("planner.statusGrabbed");
    if (row.status === "no_results") return t("planner.searchStatusNoResults");
    if (row.status === "pending") return t("planner.searchStatusPending");
    return String(row.status ?? "—");
  };

  const eventVariant = (row: any): PlannerTagVariant => {
    if (row.kind === "grab") {
      if (row.event === "completed" || row.event === "postprocess_moved") return "success";
      if (
        row.event === "dispatch_failed" ||
        row.event === "gave_up" ||
        row.event === "postprocess_failed"
      )
        return "danger";
      if (row.event === "requeued" || row.event === "stuck_recovered") return "warning";
      if (
        row.event === "dispatched" ||
        row.event === "postprocess_plex" ||
        row.event === "postprocess_located" ||
        row.event === "postprocess_renamed" ||
        row.event === "postprocess_move_queued"
      )
        return "info";
      return "default";
    }
    if (row.status === "grabbed") return "success";
    if (row.status === "no_results" || row.status === "failed") return "warning";
    return "default";
  };

  /** Mensaje de detalle: para descargas, el mensaje del evento; para búsquedas, el release elegido o el error. */
  const detailText = (row: any): string => {
    if (row.kind === "grab") return row.message ?? "—";
    return row.picked_title ?? row.message ?? "—";
  };

  /** Timestamp ISO → "28 ago, 18:30" (fecha + hora, para saber CUÁNDO). */
  const formatTimestamp = (ts: string | null | undefined): string => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    try {
      return d.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(ts);
    }
  };

  return { kindLabel, eventLabel, eventVariant, detailText, formatTimestamp };
}
