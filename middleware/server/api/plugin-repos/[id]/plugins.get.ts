/**
 * GET /api/plugin-repos/:id/plugins
 *
 * Fetch the plugin manifest for a stored repository and return its plugin
 * list. Each entry is annotated with whether the plugin is already installed
 * and whether there is a newer version available.
 *
 * Returns: { name: string, plugins: RepoPluginEntry[] }
 */
import { getPluginRepositories } from "../../../utils/database";
import { fetchTextSafe } from "../../../utils/plugin-url";
import { ensureProviders, getAllProviders } from "../../../providers/loader";

export interface RepoPluginEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  pluginType?: string;
  icon?: string;
  url: string;
  installed: boolean;
  hasUpdate: boolean;
  installedVersion?: string | null;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const rawId = getRouterParam(event, "id");
  const id = Number(rawId);
  if (!id || Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }

  const repos = getPluginRepositories();
  const repo = repos.find((r) => r.id === id);
  if (!repo) {
    throw createError({ statusCode: 404, statusMessage: "Repository not found" });
  }

  const text = await fetchTextSafe(repo.url);
  let manifest: any;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw createError({ statusCode: 502, statusMessage: "Invalid JSON from repository" });
  }

  if (!Array.isArray(manifest?.plugins)) {
    throw createError({ statusCode: 502, statusMessage: "Invalid repository manifest" });
  }

  await ensureProviders();
  const installed = new Map(
    getAllProviders().map((p) => [p.meta.id, (p.meta as any).version ?? null]),
  );

  const plugins: RepoPluginEntry[] = manifest.plugins.map((entry: any) => {
    const installedVersion = installed.has(entry.id) ? installed.get(entry.id) : undefined;
    const hasUpdate =
      installedVersion !== undefined &&
      installedVersion !== null &&
      entry.version != null &&
      _isNewer(entry.version, installedVersion);
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version ?? "0.0.0",
      description: entry.description,
      pluginType: entry.pluginType,
      icon: entry.icon,
      url: entry.url,
      installed: installedVersion !== undefined,
      hasUpdate,
      installedVersion: installedVersion ?? null,
    };
  });

  return { name: manifest.name ?? repo.name ?? repo.url, plugins };
});

/** Simple semver-ish comparison: returns true if `a` is strictly newer than `b`. */
function _isNewer(a: string, b: string): boolean {
  const parse = (v: string) =>
    String(v)
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const va = parse(a);
  const vb = parse(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const an = va[i] ?? 0;
    const bn = vb[i] ?? 0;
    if (an > bn) return true;
    if (an < bn) return false;
  }
  return false;
}
