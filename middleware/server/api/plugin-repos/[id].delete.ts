/**
 * DELETE /api/plugin-repos/:id
 *
 * Remove a stored plugin repository and uninstall all plugins that were
 * installed from it. Admin only.
 */
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  removePluginRepository,
  getPluginIdsByRepo,
} from "../../utils/database";
import {
  ensureProviders,
  getPluginFilename,
  getPluginsDir,
  resetPlugins,
} from "../../providers/loader";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  const rawId = getRouterParam(event, "id");
  const id = Number(rawId);
  if (!id || Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }

  // Collect plugin IDs before deleting the repo (FK cascade will remove the
  // plugin_repo_sources rows automatically, so we grab the list first).
  await ensureProviders();
  const pluginIds = getPluginIdsByRepo(id);

  // Delete each plugin file from disk
  for (const pluginId of pluginIds) {
    const filename = getPluginFilename(pluginId);
    if (filename?.endsWith(".js")) {
      await unlink(join(getPluginsDir(), filename)).catch(() => {});
    }
  }
  if (pluginIds.length) resetPlugins();

  const removed = removePluginRepository(id);
  if (!removed) {
    throw createError({
      statusCode: 404,
      statusMessage: "Repository not found",
    });
  }

  return { ok: true, uninstalledPlugins: pluginIds };
});
