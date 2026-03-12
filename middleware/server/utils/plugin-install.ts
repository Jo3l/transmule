/**
 * Shared utility: download, validate, and install a plugin from a remote URL.
 * Optionally records which repository installed it.
 *
 * The URL is fetched via fetchTextSafe which already enforces SSRF guards.
 */
import { writeFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { fetchTextSafe } from "./plugin-url";
import {
  getPluginsDir,
  resetPlugins,
  ensureProviders,
  loadPlugin,
} from "../providers/loader";
import { setPluginRepoSource } from "./database";

export interface InstallResult {
  id: string;
  filename: string;
}

/**
 * Download a plugin JS file from `url`, write it to the plugins directory,
 * hot-load it, and optionally record which repository it came from.
 *
 * @param url     - HTTPS URL pointing to a .js plugin file.
 * @param repoId  - If provided, the record is stored in plugin_repo_sources.
 */
export async function installPluginFromUrl(
  url: string,
  repoId?: number,
): Promise<InstallResult> {
  // fetchTextSafe performs SSRF / size validation
  const source = await fetchTextSafe(url);

  const urlPath = new URL(url).pathname;
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

  if (repoId != null) {
    setPluginRepoSource(providerId, repoId);
  }

  return { id: providerId, filename: safeName };
}
