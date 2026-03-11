/**
 * Provider registry.
 *
 * Default providers live under `server/providers/plugins/` and ship with the
 * app. User-uploaded plugins are stored in `data/plugins/`. Both are loaded
 * the same way and are equally manageable from the UI.
 */

import type { MediaProvider } from "./types";
import { readdir } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { getConfig } from "../utils/database";

const _providers = new Map<string, MediaProvider>();
const _pluginFilenames = new Map<string, string>(); // id → filename (or virtual id for bundled)

let _loaded = false;

/** Get a provider by id. */
export function getProvider(id: string): MediaProvider | undefined {
  return _providers.get(id);
}

/** Get all registered providers. */
export function getAllProviders(): MediaProvider[] {
  return [..._providers.values()];
}

/**
 * Returns the `.js` filename for a user-uploaded plugin.
 * Returns the provider id (no extension) for bundled default plugins.
 * Returns undefined if not found.
 */
export function getPluginFilename(id: string): string | undefined {
  return _pluginFilenames.get(id);
}

/** Absolute path to the user plugins directory. */
export function getPluginsDir(): string {
  const dbPath =
    process.env.NITRO_DB_PATH || resolve("data", "amule-middleware.db");
  const dir = join(dirname(dbPath), "plugins");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Clear all providers from memory and mark for full reload. */
export function resetPlugins(): void {
  _providers.clear();
  _pluginFilenames.clear();
  _loaded = false;
}

/** Ensure all providers (bundled defaults + user uploads) are loaded. */
export async function ensureProviders(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  await _loadBundledPlugins();
  await _loadPluginsFromDisk();
}

async function _loadBundledPlugins(): Promise<void> {
  const mods = await Promise.all([
    import("./plugins/yts"),
    import("./plugins/dontorrent-movies"),
    import("./plugins/dontorrent-shows"),
    import("./plugins/showrss"),
  ]);
  for (const mod of mods) {
    const provider = (mod as { default: MediaProvider }).default;
    if (!_isValidProvider(provider)) continue;
    // Respect user's explicit removal of a bundled default
    if (getConfig(`plugin_removed_${provider.meta.id}`) === "1") continue;
    _providers.set(provider.meta.id, provider);
    // Virtual filename (no .js) distinguishes bundled from user-uploaded
    _pluginFilenames.set(provider.meta.id, provider.meta.id);
  }
}

async function _loadPluginsFromDisk(): Promise<void> {
  const pluginsDir = getPluginsDir();
  let files: string[];
  try {
    files = await readdir(pluginsDir);
  } catch {
    return;
  }
  for (const file of files) {
    if (file.endsWith(".js")) {
      await loadPlugin(join(pluginsDir, file));
    }
  }
}

/**
 * Dynamically load and register a single user-uploaded plugin file.
 * Returns the registered provider id, or null on failure.
 */
export async function loadPlugin(fullPath: string): Promise<string | null> {
  const filename = basename(fullPath);
  try {
    const url = pathToFileURL(fullPath).href + `?v=${Date.now()}`;
    const mod = await import(url);
    const provider: unknown = mod.default ?? mod;
    if (!_isValidProvider(provider)) {
      console.warn(
        `[plugins] ${filename}: missing required fields (meta.id, meta.name, meta.mediaType, list)`,
      );
      return null;
    }
    const p = provider as MediaProvider;
    _providers.set(p.meta.id, p);
    _pluginFilenames.set(p.meta.id, filename);
    return p.meta.id;
  } catch (err) {
    console.error(`[plugins] Failed to load ${filename}:`, err);
    return null;
  }
}

function _isValidProvider(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const prov = p as Record<string, unknown>;
  const meta = prov.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.id !== "string" || !meta.id) return false;
  if (typeof meta.name !== "string" || !meta.name) return false;
  if (typeof meta.mediaType !== "string" || !meta.mediaType) return false;
  if (typeof prov.list !== "function") return false;
  return true;
}
