/**
 * GET /api/planner/subscriptions
 *
 * Lista subscriptions con filtros opcionales (type, monitored).
 */
import { listSubscriptions } from "~/utils/planner-db";

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
  return listSubscriptions({ type, monitored });
});
