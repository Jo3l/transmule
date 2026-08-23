/**
 * usePlannerStatus — estado de integraciones del planificador + modal de setup.
 *
 * El estado se cachea globalmente (useState) para que AppSidebar, el middleware
 * de navegación y PlannerSetupDialog compartan la misma info sin repetir fetch.
 */
import type { PlannerStatus } from "./usePlanner";

export function usePlannerStatus() {
  const status = useState<PlannerStatus | null>("_plannerStatus", () => null);
  const setupOpen = useState<boolean>("_plannerSetupOpen", () => false);

  async function loadStatus(force = false): Promise<PlannerStatus | null> {
    if (status.value && !force) return status.value;
    try {
      const { getPlannerStatus } = usePlanner();
      status.value = await getPlannerStatus();
      return status.value;
    } catch {
      return null;
    }
  }

  /** Planificador deshabilitado: sin integración de metadata configurada. */
  const plannerDisabled = computed(
    () => status.value !== null && !status.value.hasMetadataIntegration,
  );

  function openSetup() {
    setupOpen.value = true;
  }
  function closeSetup() {
    setupOpen.value = false;
  }

  return {
    status,
    plannerDisabled,
    setupOpen,
    loadStatus,
    openSetup,
    closeSetup,
  };
}
