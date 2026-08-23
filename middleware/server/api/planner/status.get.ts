/**
 * GET /api/planner/status
 *
 * Estado de las integraciones del planificador (sin exponer claves). El
 * frontend lo usa para (1) decidir el fallback TVDB→TMDB en la búsqueda de
 * series y (2) mostrar el planificador deshabilitado si no hay ninguna
 * integración de metadata configurada.
 */
import { ensureProviders, getTorrentSearchProviders } from "~/providers/loader";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Planner integration status",
    description: "Whether TVDB/TMDB and search plugins are configured.",
    responses: {
      200: { description: "Status" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const hasTvdb = (getConfig("tvdb_api_key") ?? "").trim().length > 0;
  const hasTmdb = (getConfig("tmdb_api_key") ?? "").trim().length > 0;
  await ensureProviders();
  const searchPluginCount = getTorrentSearchProviders().length;
  return {
    hasTvdb,
    hasTmdb,
    hasMetadataIntegration: hasTvdb || hasTmdb,
    searchPluginCount,
    hasSearchPlugins: searchPluginCount > 0,
  };
});
