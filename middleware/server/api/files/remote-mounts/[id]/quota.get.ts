/**
 * GET /api/files/remote-mounts/:id/quota
 *
 * Returns disk space quota for a remote mount.
 * Supports WebDAV (returns actual quota) and SMB (returns null).
 */

import { getMountById, getProvider, removeProvider } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Get remote mount quota",
    parameters: [{ name: "id", in: "path", required: true }],
    responses: {
      200: { description: "{ used: number | null, available: number | null }" },
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

  const mount = getMountById(id);
  if (!mount) {
    throw createError({ statusCode: 404, statusMessage: "Mount not found" });
  }

  const provider = getProvider(mount);
  try {
    await provider.connect();
    const quota = await provider.getQuota?.() ?? null;
    return quota ?? { used: null, available: null };
  } catch (err: any) {
    return { used: null, available: null, error: err.message };
  } finally {
    await removeProvider(id);
  }
});
