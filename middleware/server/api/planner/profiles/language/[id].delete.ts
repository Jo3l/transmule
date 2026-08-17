/**
 * DELETE /api/planner/profiles/language/:id
 *
 * Delete a language profile by id.
 */
import { deleteLanguageProfile } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Delete language profile",
    description: "Removes a planner language profile.",
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
  const ok = deleteLanguageProfile(id);
  if (!ok) {
    setResponseStatus(event, 404);
    return { error: "Profile not found" };
  }
  return { ok: true };
});
