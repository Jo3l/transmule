/**
 * Generic plugin route dispatcher.
 *
 * Plugins install their own middleware API routes via
 * `routes: { "METHOD /path/:param": handler }`. This catch-all route resolves
 * `METHOD /api/plugins/:pluginId/:subPath` to a plugin's installed handler and
 * injects a normalized request context. The core has no knowledge of what any
 * plugin route does.
 */
import { ensureProviders, getPluginRoutes } from "~/providers/loader";
import type { PluginRouteContext, PluginApiRoute } from "~/providers/types";

defineRouteMeta({
  openAPI: {
    tags: ["plugins"],
    summary: "Dispatch a plugin-installed API route",
    responses: {
      200: { description: "Handler result" },
      404: { description: "No matching plugin route" },
      401: { description: "Auth required" },
    },
  },
});

/** Match `"METHOD /path/:param"` against the request method + sub-path. */
function matchRoute(
  table: Map<string, PluginApiRoute>,
  method: string,
  path: string,
): { handler: PluginApiRoute; params: Record<string, string> } | null {
  const segs = path.split("/").filter(Boolean);
  for (const [key, handler] of table) {
    const sp = key.indexOf(" ");
    if (sp < 0) continue;
    if (key.slice(0, sp) !== method) continue;

    const pSegs = key.slice(sp + 1).split("/").filter(Boolean);
    if (pSegs.length !== segs.length) continue;

    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pSegs.length; i++) {
      if (pSegs[i].startsWith(":")) {
        params[pSegs[i].slice(1)] = decodeURIComponent(segs[i]);
      } else if (pSegs[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler, params };
  }
  return null;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const raw = getRouterParam(event, "path") ?? "";
  const segments = (Array.isArray(raw) ? raw : String(raw).split("/")).filter(
    Boolean,
  );
  const pluginId = segments[0] ?? "";
  const subPath = segments.slice(1).join("/");

  if (!pluginId) {
    throw createError({ statusCode: 400, statusMessage: "Plugin id is required" });
  }

  await ensureProviders();
  const table = getPluginRoutes(pluginId);
  if (!table) {
    throw createError({
      statusCode: 404,
      statusMessage: `Plugin "${pluginId}" has no installed routes`,
    });
  }

  const method = (event.method || "GET").toUpperCase();
  const matched = matchRoute(table, method, subPath);
  if (!matched) {
    throw createError({
      statusCode: 404,
      statusMessage: `No route ${method} /${subPath} for plugin "${pluginId}"`,
    });
  }

  let body: unknown;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await readBody(event);
    } catch {
      body = undefined;
    }
  }

  try {
    const ctx: PluginRouteContext = {
      params: matched.params,
      query: getQuery(event) as Record<string, string>,
      body,
      method,
    };
    const result = await matched.handler(ctx);
    return result === undefined ? { ok: true } : result;
  } catch (err: any) {
    const statusCode = err?.statusCode ?? 500;
    const statusMessage =
      err?.statusMessage ?? err?.message ?? "Plugin route error";
    throw createError({ statusCode, statusMessage });
  }
});
