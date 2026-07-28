defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad server status",
    description:
      "Returns the current status of the pyLoad download manager: " +
      "active downloads, queue size, download speed, pause state and free disk space. " +
      "Cached for 5 seconds to avoid hitting pyLoad's rate limiter (100 req/min).",
    responses: {
      200: { description: "pyLoad status" },
      502: { description: "pyLoad connection error" },
    },
  },
});

// ── Short-lived cache ──
let _statusCache: { data: any; ts: number } | null = null;
const STATUS_CACHE_TTL_MS = 5000;

export default defineEventHandler(async (event) => {
  requireUser(event);

  if (_statusCache && Date.now() - _statusCache.ts < STATUS_CACHE_TTL_MS) {
    return _statusCache.data;
  }

  const client = usePyLoadClient();

  try {
    const [status, freeSpace, version, proxyEnabled, reconnectEnabled] =
      await Promise.all([
        client.getStatus(),
        client.getFreeSpace().catch(() => null),
        client.getVersion().catch(() => null),
        client.getConfigValue("proxy", "enabled", "core").catch(() => null),
        client.getConfigValue("reconnect", "enabled", "core").catch(() => null),
      ]);

    const isEnabled = (value: unknown): boolean => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      if (typeof value === "string") {
        return ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
      }
      return false;
    };

    const result = {
      connected: true,
      status: {
        paused: status.pause,
        active: status.active,
        queue: status.queue,
        total: status.total,
        speed: status.speed,
        speed_fmt: formatSpeed(status.speed),
        download: status.download,
        reconnect: status.reconnect,
        proxy_enabled: isEnabled(proxyEnabled),
        reconnect_enabled: isEnabled(reconnectEnabled),
      },
      freeSpace,
      freeSpace_fmt: freeSpace != null ? formatBytes(freeSpace) : null,
      version,
    };

    _statusCache = { data: result, ts: Date.now() };
    return result;
  } catch (err: any) {
    return {
      connected: false,
      error: err?.message || String(err),
      status: null,
      freeSpace: null,
      freeSpace_fmt: null,
      version: null,
    };
  }
});
