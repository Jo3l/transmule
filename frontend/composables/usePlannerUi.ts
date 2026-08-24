/**
 * Helpers de UI compartidos del planificador.
 *
 * Extraídos de las páginas para evitar la duplicación de:
 *   - mapeo estado → etiqueta i18n (`STATUS_LABELS` + `statusLabel`)
 *   - mapeo estado → variant de STag (`statusClass`)
 *   - `pad` (SxxExx)
 *   - `formatDate` (fecha YYYY-MM-DD → locale)
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
