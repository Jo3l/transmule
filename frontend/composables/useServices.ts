/**
 * Composable to manage aMule / Transmission Docker container status.
 * Polls the admin services endpoint and exposes toggle functions.
 * Only active for admin users.
 */

interface ServiceStatus {
  running: boolean;
  status: string;
  startedAt: string | null;
}

interface ServicesState {
  amule: ServiceStatus;
  transmission: ServiceStatus;
  pyload: ServiceStatus;
}

const _services = ref<ServicesState | null>(null);
const _loading = ref<Record<string, boolean>>({
  amule: false,
  transmission: false,
  pyload: false,
});
const _loaded = ref(false);
const _lastStopped = ref<{ service: string; at: number } | null>(null);
let _interval: ReturnType<typeof setInterval> | null = null;
let _refCount = 0;

export function useServices() {
  const { apiFetch, showToast } = useApi();
  const { t } = useI18n();
  const auth = useAuth();

  const isAdmin = computed(() => auth.user.value?.isAdmin === true);

  async function refresh() {
    if (!isAdmin.value) return;
    try {
      const data = await apiFetch<{ services: ServicesState }>(
        "/api/admin/services",
      );
      _services.value = data.services;
    } catch {
      // API unreachable or Docker socket unavailable — show toggles as off
      _services.value = {
        amule: { running: false, status: "unknown", startedAt: null },
        transmission: { running: false, status: "unknown", startedAt: null },
        pyload: { running: false, status: "unknown", startedAt: null },
      };
    } finally {
      _loaded.value = true;
    }
  }

  async function toggle(service: "amule" | "transmission" | "pyload") {
    if (!_services.value) return;
    const current = _services.value[service];
    const action = current.running ? "stop" : "start";
    _loading.value = { ..._loading.value, [service]: true };

    try {
      const res = await apiFetch<{
        ok: boolean;
        running: boolean;
        status: string;
        startedAt: string | null;
      }>("/api/admin/services", {
        method: "POST",
        body: { service, action },
      });

      _services.value = {
        ..._services.value,
        [service]: {
          running: res.running,
          status: res.status,
          startedAt: res.startedAt,
        },
      };

      const label =
        service === "amule"
          ? "aMule"
          : service === "transmission"
            ? "Transmission"
            : "pyLoad";

      // Signal to watchers (e.g. downloads page) that a service was stopped
      if (action === "stop" && !res.running) {
        _lastStopped.value = { service, at: Date.now() };
      }

      showToast(
        t("services.toggled", { service: label, state: res.status }),
        "success",
        3000,
      );
    } catch {
      showToast(t("services.error"), "error", 5000);
    } finally {
      _loading.value = { ..._loading.value, [service]: false };
    }
  }

  // Reference-counted polling — start when first component mounts,
  // stop when all unmount.
  function startPolling() {
    _refCount++;
    if (_refCount === 1 && !_interval) {
      refresh();
      _interval = setInterval(refresh, 15_000);
    }
  }

  function stopPolling() {
    _refCount = Math.max(0, _refCount - 1);
    if (_refCount === 0 && _interval) {
      clearInterval(_interval);
      _interval = null;
    }
  }

  onMounted(startPolling);
  onUnmounted(stopPolling);

  return {
    services: _services,
    loading: _loading,
    loaded: _loaded,
    lastStopped: _lastStopped,
    isAdmin,
    toggle,
    refresh,
  };
}

/**
 * Lightweight composable for pages that only need to know whether a service
 * is running before making API calls. Uses the same shared module-level state
 * as useServices() — no extra polling or API calls.
 *
 * Logic: treat as "running" while data is not yet loaded or user is non-admin
 * (services === null), so pages behave normally until we have authoritative info.
 */
export function useServiceGuard() {
  const amuleRunning = computed(
    () => !_loaded.value || _services.value === null || _services.value.amule.running,
  );
  const transmissionRunning = computed(
    () => !_loaded.value || _services.value === null || _services.value.transmission.running,
  );
  const pyloadRunning = computed(
    () => !_loaded.value || _services.value === null || _services.value.pyload.running,
  );
  return { amuleRunning, transmissionRunning, pyloadRunning };
}
