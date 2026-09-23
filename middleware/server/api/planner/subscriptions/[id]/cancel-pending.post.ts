/**
 * POST /api/planner/subscriptions/:id/cancel-pending
 *
 * Cancela TODAS las tareas pendientes de una subscription (grabs activos
 * pending/dispatched y post-proceso en curso locate/rename/move), liberando
 * los episodios/películas a su estado pre-descarga.
 */
import { getSubscription, cancelAllPendingGrabsForSubscription } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Cancel all pending grabs of a subscription",
    description:
      "Cancels every active grab (pending/dispatched) and in-flight post-process " +
      "task (locate/rename/move) for the subscription, releasing episodes/movies " +
      "back to their pre-download state.",
    responses: {
      200: { description: "Cancellation counts" },
      401: { description: "Auth required" },
      404: { description: "Subscription not found" },
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

  const res = cancelAllPendingGrabsForSubscription(id);
  return { ok: true, ...res };
});
