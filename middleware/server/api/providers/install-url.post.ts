/**
 * POST /api/providers/install-url
 *
 * Install (or update) a plugin from a remote HTTPS URL.
 * The file is fetched, validated like a manual upload, and saved to the
 * plugins directory. If a plugin with the same id already exists it is
 * replaced. Admin only.
 *
 * Body: { url: string }
 */
import { writeFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { fetchTextSafe, assertSafeUrl } from "../../utils/plugin-url";
import {
  getPluginsDir,
  resetPlugins,
  ensureProviders,
  loadPlugin,
  getProvider,
  getPluginFilename,
} from "../../providers/loader";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }

  const body = await readBody<{ url?: string }>(event);
  if (!body?.url) {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }

  assertSafeUrl(body.url.trim());

  // Fetch the plugin JS source
  const source = await fetchTextSafe(body.url.trim());

  // Derive a safe filename from the URL path
  const urlPath = new URL(body.url.trim()).pathname;
  const rawName = basename(urlPath) || "plugin.js";
  const safeName =
    rawName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.js$/, "") + ".js";

  await ensureProviders();

  const destPath = join(getPluginsDir(), safeName);
  await writeFile(destPath, source, "utf8");

  resetPlugins();

  const providerId = await loadPlugin(destPath);
  if (!providerId) {
    await unlink(destPath).catch(() => {});
    throw createError({
      statusCode: 422,
      statusMessage:
        "Plugin validation failed. Media plugins need: meta.id, meta.name, meta.mediaType, list(). Torrent-search plugins need: meta.id, meta.name, meta.pluginType='torrent-search', search().",
    });
  }

  return { ok: true, id: providerId, filename: safeName };
});
