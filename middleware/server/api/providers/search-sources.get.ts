/**
 * GET /api/providers/search-sources
 *
 * Returns a flat list of torrent-search sources: one entry per plugin, or one
 * entry per sub-source for plugins that declare a `sources` descriptor (e.g.
 * indexerr exposes one source per enabled instance as "Indexerr-1337x").
 * Disabled plugins are omitted; sub-sources replace their base plugin entry.
 */
import { ensureProviders, getTorrentSearchProviders } from "../../providers/loader";
import { getConfig } from "../../utils/database";
import { callPluginRoute } from "../../utils/plugin-route";

defineRouteMeta({
  openAPI: {
    tags: ["Providers"],
    summary: "List torrent search sources (plugins + sub-sources)",
    responses: {
      200: { description: "Flat source list" },
      401: { description: "Auth required" },
    },
  },
});

export interface SearchSourceEntry {
  id: string;
  name: string;
  icon: string;
  pluginId: string;
  subSource?: string;
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  await ensureProviders();

  const plugins = getTorrentSearchProviders();
  const sources: SearchSourceEntry[] = [];

  for (const p of plugins) {
    const enabled = getConfig(`provider_enabled_${p.meta.id}`) !== "0";
    if (!enabled) continue;

    const desc = p.sources;
    if (desc) {
      try {
        const res = (await callPluginRoute(
          p.meta.id,
          desc.list.method,
          desc.list.path,
        )) as Record<string, unknown>;
        const items = (res?.[desc.itemsKey] ?? []) as Record<string, any>[];
        const subs: SearchSourceEntry[] = items
          .filter((it) => it[desc.idField] != null)
          .filter((it) => !desc.enabledField || it[desc.enabledField] !== false)
          .map((it) => ({
            id: `${p.meta.id}:${it[desc.idField]}`,
            name: `${p.meta.name}-${it[desc.labelField]}`,
            icon: p.meta.icon,
            pluginId: p.meta.id,
            subSource: String(it[desc.idField]),
          }));
        if (subs.length > 0) {
          sources.push(...subs);
          continue; // sub-sources replace the base plugin source
        }
      } catch (err) {
        console.warn(
          `[providers] failed to enumerate sources for ${p.meta.id}:`,
          err,
        );
      }
    }

    sources.push({
      id: p.meta.id,
      name: p.meta.name,
      icon: p.meta.icon,
      pluginId: p.meta.id,
    });
  }

  return { sources };
});
