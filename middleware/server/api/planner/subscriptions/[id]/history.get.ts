/**
 * GET /api/planner/subscriptions/:id/history
 *
 * Historial unificado de una subscription: búsquedas (planner_search_history)
 * + ciclo de vida de descargas (planner_grab_log), ordenado por fecha desc.
 * Cada entrada lleva `kind` ("search" | "grab") y una `key` única para el
 * frontend. Responde a "¿falló?, ¿por qué?, ¿cuándo se descargó?".
 */
import { getSubscription } from "~/utils/planner-db";
import { useDatabase } from "~/utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Subscription history (searches + downloads)",
    description:
      "Returns the unified search + download lifecycle history for a subscription.",
    responses: {
      200: { description: "Array of history entries" },
      401: { description: "Auth required" },
      404: { description: "Not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const id = Number(getRouterParam(event, "id"));
  if (!Number.isFinite(id)) {
    setResponseStatus(event, 400);
    return { error: "Invalid id" };
  }
  const sub = getSubscription(id);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }
  const q = getQuery(event) as { limit?: string };
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);

  const db = useDatabase();

  const searches = db
    .prepare(
      `SELECT id, episode_id, movie_id, search_kind, query, results_count,
              picked_release, picked_title, picked_quality, status, error_message,
              picked_at
       FROM planner_search_history
       WHERE subscription_id = ?
       ORDER BY picked_at DESC
       LIMIT ?`,
    )
    .all(id, limit) as unknown as Array<Record<string, unknown>>;

  const grabs = db
    .prepare(
      `SELECT id, episode_id, movie_id, grab_id, event, message, created_at
       FROM planner_grab_log
       WHERE subscription_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(id, limit) as unknown as Array<Record<string, unknown>>;

  const merged = [
    ...searches.map((s) => ({
      key: `search-${s.id}`,
      kind: "search",
      timestamp: s.picked_at,
      episode_id: s.episode_id,
      movie_id: s.movie_id,
      search_kind: s.search_kind,
      query: s.query,
      results_count: s.results_count,
      picked_title: s.picked_title,
      picked_quality: s.picked_quality,
      status: s.status,
      message: s.error_message,
    })),
    ...grabs.map((g) => ({
      key: `grab-${g.id}`,
      kind: "grab",
      timestamp: g.created_at,
      episode_id: g.episode_id,
      movie_id: g.movie_id,
      grab_id: g.grab_id,
      event: g.event,
      message: g.message,
    })),
  ].sort((a, b) =>
    String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")),
  );

  return merged.slice(0, limit);
});
