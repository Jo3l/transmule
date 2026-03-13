/**
 * Provider registry.
 *
 * Plugins are loaded from `data/plugins/` (user-installed `.js` files).
 * The `server/providers/plugins/` directory is gitignored and can be used
 * locally during development.
 */

import type { MediaProvider, TorrentSearchPlugin, AnyPlugin } from "./types";
import { readdir } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync, watch as fsWatch } from "node:fs";
import { getConfig } from "../utils/database";

const _providers = new Map<string, AnyPlugin>();
const _pluginFilenames = new Map<string, string>(); // id → filename (or virtual id for bundled)

let _loaded = false;

/** Get a provider by id. */
export function getProvider(id: string): AnyPlugin | undefined {
  return _providers.get(id);
}

/** Get all registered plugins (both media and torrent-search). */
export function getAllProviders(): AnyPlugin[] {
  return [..._providers.values()];
}

/** Get only torrent-search plugins. */
export function getTorrentSearchProviders(): TorrentSearchPlugin[] {
  return [..._providers.values()].filter(
    (p): p is TorrentSearchPlugin => p.meta.pluginType === "torrent-search",
  );
}

/** Get only media (content) providers. */
export function getMediaProviders(): MediaProvider[] {
  return [..._providers.values()].filter(
    (p): p is MediaProvider => p.meta.pluginType !== "torrent-search",
  );
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
  _watcher?.close();
  _watcher = null;
}

let _watcher: ReturnType<typeof fsWatch> | null = null;

/** Ensure all providers (bundled defaults + user uploads) are loaded. */
export async function ensureProviders(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  await _loadPluginsFromDisk();
  _startWatcher();
}

function _startWatcher(): void {
  if (_watcher) return;
  const dir = getPluginsDir();
  try {
    _watcher = fsWatch(dir, (_event, filename) => {
      if (filename?.endsWith(".js")) {
        resetPlugins();
        _watcher = null; // will be restarted on next ensureProviders call
      }
    });
    _watcher.on("error", () => {
      _watcher = null;
    });
  } catch {
    // ignore — watcher is best-effort
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
 * Returns the registered plugin id, or null on failure.
 */
export async function loadPlugin(fullPath: string): Promise<string | null> {
  const filename = basename(fullPath);
  try {
    const url = pathToFileURL(fullPath).href + `?v=${Date.now()}`;
    const mod = await import(url);
    const plugin: unknown = mod.default ?? mod;
    if (!_isValidPlugin(plugin)) {
      console.warn(
        `[plugins] ${filename}: invalid plugin — media plugins need meta.id, meta.name, meta.mediaType, list(); torrent-search plugins need meta.id, meta.name, meta.pluginType="torrent-search", search()`,
      );
      return null;
    }
    const p = plugin as AnyPlugin;
    _providers.set(p.meta.id, p);
    _pluginFilenames.set(p.meta.id, filename);
    return p.meta.id;
  } catch (err) {
    console.error(`[plugins] Failed to load ${filename}:`, err);
    return null;
  }
}

function _isValidPlugin(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const prov = p as Record<string, unknown>;
  const meta = prov.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.id !== "string" || !meta.id) return false;
  if (typeof meta.name !== "string" || !meta.name) return false;

  if (meta.pluginType === "torrent-search") {
    // Torrent-search plugin: needs search() function, no mediaType required
    return typeof prov.search === "function";
  }

  // Media plugin (default): needs mediaType and list()
  if (typeof meta.mediaType !== "string" || !meta.mediaType) return false;
  return typeof prov.list === "function";
}
