/**
 * POST /api/files/remote-mounts/:id/validate
 *
 * Validate connection to a remote mount.
 */

import { testConnection, getMountById, removeProvider } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Validate remote mount connection",
    responses: {
      200: { description: "{ ok: boolean, error?: string }" },
      404: { description: "Mount not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { id } = event.context.params || {};
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Mount ID is required" });
  }

  const mount = getMountById(id);
  if (!mount) {
    throw createError({ statusCode: 404, statusMessage: "Mount not found" });
  }

  try {
    const ok = await testConnection(mount);
    await removeProvider(id);
    
    if (ok) {
      return { ok: true };
    } else {
      return { ok: false, error: "Connection failed" };
    }
  } catch (err: any) {
    await removeProvider(id);
    return { ok: false, error: err.message || "Connection failed" };
  }
});
