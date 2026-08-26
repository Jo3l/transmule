/**
 * Shared utility: download, validate, and install a plugin from a remote URL.
 * Optionally records which repository installed it.
 *
 * The URL is fetched via fetchTextSafe which already enforces SSRF guards.
 *
 * UPDATE SAFETY (atomic replace): the current plugin file is backed up to
 * `<name>.bak` BEFORE the new version is written. If the new version fails
 * validation, the backup is restored and the previously-installed plugin keeps
 * working. Plugin state (`plugin_kv`) is never touched here — it lives in the
 * DB and survives updates.
 */
import { writeFile, unlink, rename, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
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
  const bakPath = destPath + ".bak";
  const hadOld = existsSync(destPath);

  // Actualización atómica: respaldar la versión actual ANTES de sobrescribir.
  if (hadOld) {
    await rm(bakPath, { force: true }).catch(() => {});
    try {
      await rename(destPath, bakPath);
    } catch (err: any) {
      // No se pudo crear el backup → abortar sin tocar el fichero actual.
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to back up current plugin: ${err?.message ?? err}`,
      });
    }
  }

  await writeFile(destPath, source, "utf8");

  resetPlugins();

  const providerId = await loadPlugin(destPath);
  if (!providerId) {
    // La versión nueva no valida → restaurar la anterior desde el backup.
    await unlink(destPath).catch(() => {});
    if (hadOld && existsSync(bakPath)) {
      await rename(bakPath, destPath).catch(() => {});
      resetPlugins();
      await loadPlugin(destPath);
    }
    throw createError({
      statusCode: 422,
      statusMessage:
        "Plugin validation failed. Media plugins need: meta.id, meta.name, meta.mediaType, list(). Torrent-search plugins need: meta.id, meta.name, meta.pluginType='torrent-search', search(). The previous version was restored.",
    });
  }

  // Éxito → limpiar el backup.
  if (hadOld) await rm(bakPath, { force: true }).catch(() => {});

  if (repoId != null) {
    setPluginRepoSource(providerId, repoId);
  }

  return { id: providerId, filename: safeName };
}