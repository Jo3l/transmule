/**
 * Builds the `PluginContext` injected into a plugin's `install(ctx)`.
 *
 * The context bundles generic core services (persisted storage, a scoped
 * logger, scheduled tasks, and an HTTP-error helper) so plugins can be
 * self-contained while still using core primitives.
 */
import type {
  PluginContext,
  PluginStorage,
} from "../providers/types";
import {
  pluginStorageGet,
  pluginStorageSet,
  pluginStorageRemove,
  pluginStorageList,
} from "./plugin-storage";

// Tracks interval cancel functions per plugin so resetPlugins() can clean up.
const _intervalCancels = new Map<string, Set<() => void>>();

/** Cancel every scheduled task registered by a plugin. */
export function clearPluginIntervals(pluginId: string): void {
  const cancels = _intervalCancels.get(pluginId);
  if (!cancels) return;
  for (const cancel of cancels) {
    try {
      cancel();
    } catch {
      /* ignore */
    }
  }
  _intervalCancels.delete(pluginId);
}

/** Build the service context for a plugin. */
export function createPluginContext(
  pluginId: string,
  capabilities: Record<string, unknown> = {},
): PluginContext {
  const storage: PluginStorage = {
    get: <T>(key: string) => pluginStorageGet<T>(pluginId, key),
    set: (key, value) => pluginStorageSet(pluginId, key, value),
    remove: (key) => pluginStorageRemove(pluginId, key),
    list: () => pluginStorageList(pluginId),
  };

  return {
    storage,
    log: (...args: unknown[]) => console.log(`[plugin:${pluginId}]`, ...args),
    interval(fn, ms) {
      const timer = setInterval(() => {
        void Promise.resolve()
          .then(() => fn())
          .catch((err) =>
            console.error(`[plugin:${pluginId}] interval error:`, err),
          );
      }, ms);
      const cancel = () => clearInterval(timer);
      if (!_intervalCancels.has(pluginId)) {
        _intervalCancels.set(pluginId, new Set());
      }
      _intervalCancels.get(pluginId)!.add(cancel);
      return cancel;
    },
    httpError(statusCode, statusMessage) {
      const err = new Error(statusMessage) as Error & {
        statusCode: number;
        statusMessage: string;
      };
      err.statusCode = statusCode;
      err.statusMessage = statusMessage;
      return err;
    },
    ...capabilities,
  };
}
