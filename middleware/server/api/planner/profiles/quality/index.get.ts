/**
 * GET /api/planner/profiles/quality
 *
 * List all quality profiles.
 */
import { listQualityProfiles } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "List quality profiles",
    description: "Returns all planner quality profiles.",
    responses: {
      200: { description: "Array of quality profiles" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  return listQualityProfiles();
});
