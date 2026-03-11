/**
 * DELETE /api/providers/:id
 *
 * Delete a user-uploaded plugin by provider id.
 * Built-in providers cannot be deleted.
 */
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  ensureProviders,
  getProvider,
  isBuiltinProvider,
  getPluginFilename,
  getPluginsDir,
  resetPlugins,
} from "../../providers/loader";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Provider id is required" });
  }

  await ensureProviders();

  const provider = getProvider(id);
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: `Provider "${id}" not found` });
  }

  if (isBuiltinProvider(id)) {
    throw createError({ statusCode: 403, statusMessage: "Built-in providers cannot be deleted" });
  }

  const filename = getPluginFilename(id);
  if (!filename) {
    throw createError({ statusCode: 500, statusMessage: "Plugin filename not tracked" });
  }

  const filePath = join(getPluginsDir(), filename);
  try {
    await unlink(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw createError({ statusCode: 500, statusMessage: "Failed to delete plugin file" });
    }
  }

  // Remove from memory
  resetPlugins();

  return { ok: true, id };
});
