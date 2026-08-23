/**
 * Global route middleware — evita abrir el planificador sin integraciones.
 *
 * Si no hay ninguna integración de metadata (TVDB/TMDB) configurada, las rutas
 * /planner/* no funcionarían (búsqueda + sync de episodios). Redirige a "/" y
 * abre la modal de setup que recuerda configurar Configuración → Integraciones.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith("/planner")) return;

  const { loadStatus, openSetup } = usePlannerStatus();
  // force: refrescar para que configurar integraciones y volver no quede bloqueado
  const status = await loadStatus(true);
  if (status && !status.hasMetadataIntegration) {
    openSetup();
    return navigateTo("/");
  }
});
