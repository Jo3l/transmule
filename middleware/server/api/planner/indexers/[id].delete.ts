/**
 * DELETE /api/planner/indexers/:id
 *
 * Delete an indexer by id.
 */
import { deleteIndexer } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Delete indexer",
    description: "Removes an indexer.",
    responses: {
      200: { description: "Indexer deleted" },
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
  const ok = deleteIndexer(id);
  if (!ok) {
    setResponseStatus(event, 404);
    return { error: "Indexer not found" };
  }
  return { ok: true };
});
