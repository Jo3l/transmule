/**
 * POST /api/providers/upload
 *
 * Upload a user plugin (.js file). The file must export a valid MediaProvider
 * as its default export.
 *
 * Body: multipart/form-data with a single field "file" (the .js file).
 */
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  getPluginsDir,
  resetPlugins,
  ensureProviders,
  loadPlugin,
} from "../../providers/loader";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  const formData = await readMultipartFormData(event);
  const filePart = formData?.find((p) => p.name === "file");

  if (!filePart?.filename || !filePart.data) {
    throw createError({ statusCode: 400, statusMessage: "No file uploaded" });
  }

  if (!filePart.filename.endsWith(".js")) {
    throw createError({
      statusCode: 400,
      statusMessage: "Only .js files are accepted",
    });
  }

  // Sanitize: keep only safe filename characters, force .js extension
  const safeName =
    filePart.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.js$/, "") +
    ".js";

  // Ensure built-ins are loaded first
  await ensureProviders();

  const destPath = join(getPluginsDir(), safeName);
  await writeFile(destPath, filePart.data);

  // Reset user plugins so the new file is picked up
  resetPlugins();

  // Load the new plugin directly
  const providerId = await loadPlugin(destPath);
  if (!providerId) {
    // Remove the invalid file so it doesn't get loaded on next restart
    await unlink(destPath).catch(() => {});
    throw createError({
      statusCode: 422,
      statusMessage:
        "Plugin validation failed. Media plugins need: meta.id, meta.name, meta.mediaType, list(). Torrent-search plugins need: meta.id, meta.name, meta.pluginType='torrent-search', search().",
    });
  }

  return { ok: true, id: providerId, filename: safeName };
});
