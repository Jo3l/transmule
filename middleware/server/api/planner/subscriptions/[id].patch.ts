/**
 * PATCH /api/planner/subscriptions/:id
 *
 * Actualiza una subscription (monitored, min_quality, root_folder, etc.).
 */
import { updateSubscription } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Update subscription",
    description: "Partially updates a subscription.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              monitored: { type: "boolean" },
              min_quality: { type: "string", enum: ["uhd", "fullhd", "hd", "sd"] },
              root_folder: { type: "string" },
              search_services_json: { type: "string", nullable: true },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Subscription updated" },
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
  const body = await readBody(event);
  if (!body || typeof body !== "object") {
    setResponseStatus(event, 400);
    return { error: "Invalid body" };
  }
  const updated = updateSubscription(id, {
    monitored:
      body.monitored !== undefined ? Boolean(body.monitored) : undefined,
    min_quality: body.min_quality,
    max_size_mb:
      body.max_size_mb !== undefined
        ? body.max_size_mb === null || body.max_size_mb === ""
          ? null
          : Number(body.max_size_mb)
        : undefined,
    root_folder: body.root_folder,
    search_services_json:
      body.search_services_json !== undefined ? body.search_services_json : undefined,
    language:
      body.language !== undefined ? (body.language || null) : undefined,
    smart_rename:
      body.smart_rename !== undefined ? body.smart_rename === true : undefined,
    plex_scan:
      body.plex_scan !== undefined ? body.plex_scan === true : undefined,
  });
  if (!updated) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }
  return updated;
});
