import { requireUser } from "../../utils/requireUser";
import { findShareById, revokeShare } from "../../utils/share-db";

defineRouteMeta({
  openAPI: {
    tags: ["Shares"],
    summary: "Revoke a share link (effective immediately)",
    parameters: [{ name: "id", in: "path", required: true }],
    responses: { 200: { description: "Revoked" }, 404: { description: "Unknown share" } },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  const id = decodeURIComponent(getRouterParam(event, "id") ?? "");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id is required" });

  if (!findShareById(id)) {
    throw createError({ statusCode: 404, statusMessage: "Share not found" });
  }
  // Revoking twice is not an error: the link is already dead.
  revokeShare(id);
  return { ok: true, id };
});
