/**
 * GET /api/planner/subscriptions/:id/history
 *
 * Historial de búsquedas/grabs de una subscription.
 */
import { getSubscription } from "~/utils/planner-db";
import { useDatabase } from "~/utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Subscription search history",
    description: "Returns the search/grab history for a subscription.",
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
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);

  const db = useDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM planner_search_history
       WHERE subscription_id = ?
       ORDER BY picked_at DESC
       LIMIT ?`,
    )
    .all(id, limit) as unknown as Record<string, unknown>[];
  return rows;
});
