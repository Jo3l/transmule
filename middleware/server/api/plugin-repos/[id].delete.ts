/**
 * DELETE /api/plugin-repos/:id
 *
 * Remove a stored plugin repository. Admin only.
 */
import { removePluginRepository } from "../../utils/database";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }

  const rawId = getRouterParam(event, "id");
  const id = Number(rawId);
  if (!id || Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }

  const removed = removePluginRepository(id);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: "Repository not found" });
  }

  return { ok: true };
});
