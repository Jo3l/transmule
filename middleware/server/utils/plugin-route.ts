/**
 * Generic helper to invoke a plugin's installed route from core code.
 *
 * The dispatch endpoint (`api/plugins/[...path].ts`) uses this same route
 * table; this helper lets other core services (e.g. source enumeration) call
 * a plugin route directly, without going through HTTP.
 */
import { getPluginRoutes } from "../providers/loader";
import type { PluginApiRoute, PluginRouteContext } from "../providers/types";

export async function callPluginRoute(
  pluginId: string,
  method: string,
  path: string,
  opts: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const table = getPluginRoutes(pluginId);
  if (!table) {
    throw new Error(`Plugin "${pluginId}" has no installed routes`);
  }
  const handler: PluginApiRoute | undefined = table.get(`${method} ${path}`);
  if (!handler) {
    throw new Error(`Plugin "${pluginId}" has no route ${method} ${path}`);
  }
  const ctx: PluginRouteContext = {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body,
    method,
  };
  return handler(ctx);
}
