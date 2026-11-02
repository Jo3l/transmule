/**
 * First-run setup wizard.
 *
 * Shown floating over the app when the install is missing something only an
 * admin can fix:
 *   - no plugins installed (no browse/search sources), or
 *   - neither TMDB nor TVDB configured — the fallback metadata providers used
 *     by the planner for covers and titles.
 *
 * The wizard walks the admin through Settings → Integrations, Providers, Ports
 * and About (star the repo). It can be reopened at any time from About.
 */

export type SetupWizardStepId = "integrations" | "providers" | "ports" | "about";

export interface SetupWizardStep {
  id: SetupWizardStepId;
  icon: string;
}

const DISMISS_KEY = "transmule.setupWizard.dismissed";

const STEPS: SetupWizardStep[] = [
  { id: "integrations", icon: "mdi-puzzle-outline" },
  { id: "providers", icon: "mdi-application-cog-outline" },
  { id: "ports", icon: "mdi-lan" },
  { id: "about", icon: "mdi-github" },
];

export function useSetupWizard() {
  const { apiFetch } = useApi();

  const open = useState<boolean>("setupWizard:open", () => false);
  const step = useState<number>("setupWizard:step", () => 0);
  const checked = useState<boolean>("setupWizard:checked", () => false);
  const missingPlugins = useState<boolean>("setupWizard:missingPlugins", () => false);
  const missingMetadata = useState<boolean>("setupWizard:missingMetadata", () => false);

  const steps = STEPS;
  const total = STEPS.length;
  const needsSetup = computed(() => missingPlugins.value || missingMetadata.value);

  function isDismissed(): boolean {
    if (!import.meta.client) return true;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return true;
    }
  }

  function setDismissed(value: boolean): void {
    if (!import.meta.client) return;
    try {
      if (value) window.localStorage.setItem(DISMISS_KEY, "1");
      else window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* storage unavailable — the wizard just won't remember */
    }
  }

  /**
   * Ask the API whether something is still missing. Cached for the session;
   * pass force to re-check (About → run the wizard again).
   */
  async function detect(force = false): Promise<boolean> {
    if (checked.value && !force) return needsSetup.value;
    try {
      const [providers, integrations] = await Promise.all([
        apiFetch<unknown[]>("/api/providers"),
        apiFetch<{ tmdbApiKeySet?: boolean; tvdbApiKeySet?: boolean }>(
          "/api/admin/integrations",
        ),
      ]);
      missingPlugins.value = (providers?.length ?? 0) === 0;
      missingMetadata.value = !integrations?.tmdbApiKeySet && !integrations?.tvdbApiKeySet;
    } catch {
      // Not an admin, backend down…: never nag in that case.
      missingPlugins.value = false;
      missingMetadata.value = false;
    } finally {
      checked.value = true;
    }
    return needsSetup.value;
  }

  /** Re-check silently so the step badges reflect what the admin just did. */
  async function refreshStatus(): Promise<void> {
    await detect(true);
  }

  /** Auto-open on app load, unless it was already dismissed. */
  async function maybeAutoOpen(): Promise<void> {
    if (isDismissed()) return;
    if (await detect()) {
      step.value = 0;
      open.value = true;
    }
  }

  /** Manual start (About tab button): always shows, even if everything is set. */
  function start(at = 0): void {
    step.value = Math.min(Math.max(at, 0), total - 1);
    open.value = true;
    setDismissed(false);
    void refreshStatus();
  }

  function goTo(index: number): void {
    step.value = Math.min(Math.max(index, 0), total - 1);
  }

  function next(): void {
    goTo(step.value + 1);
  }

  function previous(): void {
    goTo(step.value - 1);
  }

  /** Close and remember it, so it does not come back on every reload. */
  function dismiss(): void {
    open.value = false;
    setDismissed(true);
  }

  /** Close without remembering (used after the last step). */
  function finish(): void {
    open.value = false;
    setDismissed(true);
  }

  return {
    open,
    step,
    steps,
    total,
    needsSetup,
    missingPlugins,
    missingMetadata,
    detect,
    refreshStatus,
    maybeAutoOpen,
    start,
    goTo,
    next,
    previous,
    dismiss,
    finish,
  };
}
