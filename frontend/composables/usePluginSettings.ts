/**
 * Plugin settings SPI (frontend).
 *
 * Type definitions for the `settings` descriptor a plugin declares, plus a
 * tiny API helper that calls a plugin's installed routes via the generic
 * `/api/plugins/:pluginId/...` dispatcher. The core frontend renders a
 * plugin's settings generically from this descriptor — it has no knowledge
 * of any specific plugin.
 */

/** A single field in a dynamic config form. */
export interface PluginFieldSchema {
  name: string;
  type: string;
  label: string;
  default?: string | number | boolean;
  options?: Record<string, string>;
  required?: boolean;
}

/** A callable plugin route (`method` + `path`, `path` may contain `:params`). */
export interface PluginSettingsAction {
  key?: string;
  label?: string;
  icon?: string;
  method: string;
  path: string;
}

/** How to list the catalog items and read which are configured. */
export interface PluginSettingsList {
  method: string;
  path: string;
  /** Key in the response holding the array of items. */
  itemsKey: string;
  idField: string;
  labelField: string;
  /** Extra fields rendered as small tags next to the label. */
  metaFields?: string[];
  /** Key in the response holding `{ [itemId]: instance }`. */
  configuredKey?: string;
  addLabel?: string;
}

/** Per-item config flow (schema + instance CRUD). */
export interface PluginSettingsItem {
  schema: PluginSettingsAction;
  create: PluginSettingsAction;
  update: PluginSettingsAction;
  remove: PluginSettingsAction;
  test?: PluginSettingsAction;
}

/** A `collection-manager` settings descriptor (the only supported type). */
export interface PluginSettingsDescriptor {
  type: string;
  title?: string;
  description?: string;
  toolbar?: PluginSettingsAction[];
  list: PluginSettingsList;
  item: PluginSettingsItem;
}

/** Calls a plugin's installed route through the generic dispatcher. */
export function usePluginApi(pluginId: string) {
  const { apiFetch } = useApi();

  function fetch<T = Record<string, any>>(
    action: PluginSettingsAction,
    params?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    let path = action.path;
    for (const [k, v] of Object.entries(params ?? {})) {
      path = path.replace(`:${k}`, encodeURIComponent(v));
    }
    const opts: Record<string, unknown> = { method: action.method };
    if (["POST", "PUT", "PATCH"].includes(action.method)) {
      opts.body = body ?? {};
    }
    return apiFetch<T>(`/api/plugins/${pluginId}${path}`, opts);
  }

  return { fetch };
}
