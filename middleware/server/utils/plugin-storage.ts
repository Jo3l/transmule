/**
 * Generic per-plugin JSON key/value store.
 *
 * This is the persistence surface exposed to plugins via `ctx.storage`.
 * It is deliberately generic (a `plugin_kv` table keyed by plugin id) so the
 * core has no knowledge of any plugin's data shape.
 */
import { useDatabase } from "./database";

interface KvRow {
  plugin_id: string;
  key: string;
  value: string;
  updated_at: string;
}

function read(pluginId: string, key: string): KvRow | undefined {
  return useDatabase()
    .prepare("SELECT * FROM plugin_kv WHERE plugin_id = ? AND key = ?")
    .get(pluginId, key) as unknown as KvRow | undefined;
}

/** Get a JSON value for a plugin key (undefined if absent). */
export function pluginStorageGet<T = unknown>(
  pluginId: string,
  key: string,
): T | undefined {
  const row = read(pluginId, key);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

/** Persist a JSON value for a plugin key (upsert). */
export function pluginStorageSet(
  pluginId: string,
  key: string,
  value: unknown,
): void {
  useDatabase()
    .prepare(
      `INSERT INTO plugin_kv (plugin_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(plugin_id, key) DO UPDATE SET
         value = excluded.value,
         updated_at = datetime('now')`,
    )
    .run(pluginId, key, JSON.stringify(value));
}

/** Remove a plugin key. */
export function pluginStorageRemove(pluginId: string, key: string): void {
  useDatabase()
    .prepare("DELETE FROM plugin_kv WHERE plugin_id = ? AND key = ?")
    .run(pluginId, key);
}

/** List all keys stored by a plugin. */
export function pluginStorageList(pluginId: string): string[] {
  const rows = useDatabase()
    .prepare("SELECT key FROM plugin_kv WHERE plugin_id = ?")
    .all(pluginId) as { key: string }[];
  return rows.map((r) => r.key);
}

/** Remove all keys stored by a plugin (used on plugin uninstall). */
export function pluginStorageClear(pluginId: string): void {
  useDatabase()
    .prepare("DELETE FROM plugin_kv WHERE plugin_id = ?")
    .run(pluginId);
}
