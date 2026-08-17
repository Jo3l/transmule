/**
 * GET /api/planner/indexers
 *
 * List all configured indexers (Newznab/Torznab/RSS).
 */
import { listIndexers } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "List indexers",
    description: "Returns all configured indexers.",
    responses: {
      200: { description: "Array of indexers" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event);
  const enabled = q.enabled !== undefined ? q.enabled === "true" || q.enabled === "1" : undefined;
  return listIndexers({ enabled });
});
