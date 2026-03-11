/**
 * Provider registry.
 *
 * Built-in providers live under `server/providers/` and self-register via
 * `registerProvider()` at module init time.
 * User-uploaded plugins are stored in `data/plugins/` and loaded dynamically.
 */

import type { MediaProvider } from "./types";
import { readdir } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const _providers = new Map<string, MediaProvider>();
const _builtinIds = new Set<string>();
const _pluginFilenames = new Map<string, string>(); // provider id → filename

let _builtinsLoaded = false;
let _pluginsLoaded = false;
let _loadingBuiltins = false;

/** Register a provider. Built-in providers call this during their module init. */
export function registerProvider(provider: MediaProvider): void {
  _providers.set(provider.meta.id, provider);
  if (_loadingBuiltins) _builtinIds.add(provider.meta.id);
}

/** Get a provider by id. */
export function getProvider(id: string): MediaProvider | undefined {
  return _providers.get(id);
}

/** Get all registered providers. */
export function getAllProviders(): MediaProvider[] {
  return [..._providers.values()];
}

/** True if the provider is a built-in (not user-uploaded). */
export function isBuiltinProvider(id: string): boolean {
  return _builtinIds.has(id);
}

/** Returns the `.js` filename for a user-uploaded plugin, or undefined for built-ins. */
export function getPluginFilename(id: string): string | undefined {
  return _pluginFilenames.get(id);
}

/** Absolute path to the user plugins directory. */
export function getPluginsDir(): string {
  const dbPath = process.env.NITRO_DB_PATH || resolve("data", "amule-middleware.db");
  const dir = join(dirname(dbPath), "plugins");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Remove all user-uploaded plugins from memory and mark for reload.
 * Built-in providers remain registered.
 */
export function resetPlugins(): void {
  for (const id of [..._providers.keys()]) {
    if (!_builtinIds.has(id)) {
      _providers.delete(id);
      _pluginFilenames.delete(id);
    }
  }
  _pluginsLoaded = false;
}

/** Ensure all providers (built-ins + user plugins) are loaded. */
export async function ensureProviders(): Promise<void> {
  if (!_builtinsLoaded) {
    _builtinsLoaded = true;
    _loadingBuiltins = true;
    // Load built-in providers (each self-registers via registerProvider)
    await import("./yts"); // eslint-disable-line
    await import("./dontorrent-movies"); // eslint-disable-line
    await import("./dontorrent-shows"); // eslint-disable-line
    await import("./showrss"); // eslint-disable-line
    _loadingBuiltins = false;
  }

  if (!_pluginsLoaded) {
    _pluginsLoaded = true;
    await _loadPluginsFromDisk();
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
 * Dynamically load and register a single plugin file.
 * Returns the registered provider id, or null on failure.
 */
export async function loadPlugin(fullPath: string): Promise<string | null> {
  const filename = basename(fullPath);
  try {
    // Cache-bust so re-uploaded files are always fresh
    const url = pathToFileURL(fullPath).href + `?v=${Date.now()}`;
    const mod = await import(url);
    const provider: unknown = mod.default ?? mod;
    if (!_isValidProvider(provider)) {
      console.warn(`[plugins] ${filename}: missing required fields (meta.id, meta.name, meta.mediaType, list)`);
      return null;
    }
    registerProvider(provider as MediaProvider);
    _pluginFilenames.set((provider as MediaProvider).meta.id, filename);
    return (provider as MediaProvider).meta.id;
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
  if (meta.mediaType !== "movies" && meta.mediaType !== "shows") return false;
  if (typeof prov.list !== "function") return false;
  return true;
}
