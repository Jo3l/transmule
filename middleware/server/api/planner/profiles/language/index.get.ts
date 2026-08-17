/**
 * GET /api/planner/profiles/language
 *
 * List all language profiles.
 */
import { listLanguageProfiles } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "List language profiles",
    description: "Returns all planner language profiles.",
    responses: {
      200: { description: "Array of language profiles" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  return listLanguageProfiles();
});
