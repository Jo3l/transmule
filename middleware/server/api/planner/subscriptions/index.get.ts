/**
 * GET /api/planner/subscriptions
 *
 * Lista subscriptions con filtros opcionales (type, monitored).
 */
import { listSubscriptions, getSeriesAttention } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "List subscriptions",
    description: "Returns planner subscriptions, optionally filtered by type/monitored.",
    responses: {
      200: { description: "Array of subscriptions" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as { type?: string; monitored?: string };
  const type = q.type === "series" || q.type === "movie" ? q.type : undefined;
  const monitored =
    q.monitored !== undefined
      ? q.monitored === "true" || q.monitored === "1"
      : undefined;
  const subs = listSubscriptions({ type, monitored });

  // Listado de series: añade el aviso de "episodios emitidos recientes sin
  // descargar de la temporada en curso" (icono de notificación en la tarjeta).
  // Solo se calcula cuando el listado puede contener series.
  if (type === "movie") return subs;

  const attention = getSeriesAttention();
  return subs.map((s) => {
    if (s.type !== "series") return s;
    const a = attention.get(s.id);
    return {
      ...s,
      recent_missing_count: a?.count ?? 0,
      current_season: a?.season ?? null,
    };
  });
});
