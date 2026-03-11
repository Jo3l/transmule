/**
 * DELETE /api/providers/:id
 *
 * Remove a provider. For user-uploaded plugins the .js file is deleted.
 * For bundled default plugins a DB flag is set so they won't reload on restart.
 */
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  ensureProviders,
  getProvider,
  getPluginFilename,
  getPluginsDir,
  resetPlugins,
} from "../../providers/loader";
import { setConfig } from "../../utils/database";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Provider id is required",
    });
  }

  await ensureProviders();

  const provider = getProvider(id);
  if (!provider) {
    throw createError({
      statusCode: 404,
      statusMessage: `Provider "${id}" not found`,
    });
  }

  const filename = getPluginFilename(id);

  if (!filename || !filename.endsWith(".js")) {
    // Bundled default plugin — mark as removed in DB so it skips on next reload
    setConfig(`plugin_removed_${id}`, "1");
  } else {
    // User-uploaded plugin — delete the actual file
    const filePath = join(getPluginsDir(), filename);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw createError({
          statusCode: 500,
          statusMessage: "Failed to delete plugin file",
        });
      }
    }
  }

  resetPlugins();
  return { ok: true, id };
});
