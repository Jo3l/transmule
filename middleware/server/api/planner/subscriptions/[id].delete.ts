/**
 * DELETE /api/planner/subscriptions/:id
 *
 * Borra una subscription (cascade borra seasons/episodes/movie/history).
 */
import { deleteSubscription } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Delete subscription",
    description: "Removes a subscription and its dependent rows (cascade).",
    responses: {
      200: { description: "Subscription deleted" },
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
  const ok = deleteSubscription(id);
  if (!ok) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }
  return { ok: true };
});
