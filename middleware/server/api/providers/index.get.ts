/**
 * GET /api/providers
 *
 * Returns the list of all registered plugins (media + torrent-search)
 * with their metadata and enabled/disabled status.
 */
import {
  ensureProviders,
  getAllProviders,
  getPluginFilename,
} from "../../providers/loader";
import type { MediaProvider } from "../../providers/types";
import { getConfig } from "../../utils/database";

export default defineEventHandler(async (event) => {
  requireUser(event);

  await ensureProviders();
  const plugins = getAllProviders();

  return plugins.map((p) => {
    const enabled = getConfig(`provider_enabled_${p.meta.id}`);
    const asMedia = p as MediaProvider;
    return {
      ...p.meta,
      enabled: enabled !== "0",
      hasDetail: typeof asMedia.detail === "function",
      hasCover: typeof asMedia.cover === "function",
      filters: asMedia.filters ?? [],
      filename: getPluginFilename(p.meta.id),
      version: (p.meta as any).version ?? null,
      repository: (p.meta as any).repository ?? null,
    };
  });
});
