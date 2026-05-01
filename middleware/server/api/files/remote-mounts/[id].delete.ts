/**
 * DELETE /api/files/remote-mounts/:id
 *
 * Remove (unmount) a remote mount.
 */

import { loadMounts, saveMounts, removeProvider } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Delete remote mount",
    parameters: [{ name: "id", in: "path", required: true }],
    responses: {
      200: { description: "Mount removed" },
      404: { description: "Mount not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const mounts = loadMounts();
  const idx = mounts.findIndex((m) => m.id === id);
  if (idx === -1) {
    throw createError({ statusCode: 404, statusMessage: "Mount not found" });
  }

  mounts.splice(idx, 1);
  saveMounts(mounts);

  // Clean up provider cache
  await removeProvider(id);

  return { ok: true };
});
