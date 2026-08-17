/**
 * PATCH /api/planner/subscriptions/:id/episodes/:eid
 *
 * Actualiza un episodio (monitored toggle principalmente).
 */
import { getSubscription, updateEpisode } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Update episode",
    description: "Partially updates a single episode (e.g. monitored flag).",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              monitored: { type: "boolean" },
              status: { type: "string" },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Episode updated" },
      401: { description: "Auth required" },
      404: { description: "Not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const subId = Number(getRouterParam(event, "id"));
  const epId = Number(getRouterParam(event, "eid"));
  if (!Number.isFinite(subId) || !Number.isFinite(epId)) {
    setResponseStatus(event, 400);
    return { error: "Invalid id" };
  }
  const sub = getSubscription(subId);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }
  const body = await readBody(event);
  const updated = updateEpisode(epId, {
    monitored:
      body?.monitored !== undefined ? Number(Boolean(body.monitored)) : undefined,
    status: body?.status,
  });
  if (!updated) {
    setResponseStatus(event, 404);
    return { error: "Episode not found" };
  }
  return updated;
});
