/**
 * DELETE /api/planner/profiles/quality/:id
 *
 * Delete a quality profile by id.
 */
import { deleteQualityProfile } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Delete quality profile",
    description: "Removes a planner quality profile.",
    responses: {
      200: { description: "Profile deleted" },
      401: { description: "Auth required" },
      404: { description: "Profile not found" },
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
  const ok = deleteQualityProfile(id);
  if (!ok) {
    setResponseStatus(event, 404);
    return { error: "Profile not found" };
  }
  return { ok: true };
});
