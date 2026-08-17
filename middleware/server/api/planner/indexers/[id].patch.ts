/**
 * PATCH /api/planner/indexers/:id
 *
 * Update an indexer (enable/disable, change priority, base_url, api_key).
 */
import { updateIndexer } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Update indexer",
    description: "Partially update an indexer.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              kind: { type: "string" },
              base_url: { type: "string" },
              api_key: { type: "string", nullable: true },
              enabled: { type: "boolean" },
              priority: { type: "integer" },
              last_sync_at: { type: "string", nullable: true },
              last_sync_status: { type: "string", nullable: true },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Indexer updated" },
      401: { description: "Auth required" },
      404: { description: "Indexer not found" },
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
  const updated = updateIndexer(id, body ?? {});
  if (!updated) {
    setResponseStatus(event, 404);
    return { error: "Indexer not found" };
  }
  return updated;
});
