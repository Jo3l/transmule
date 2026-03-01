import type { PyLoadStatus } from "~/utils/pyload-client";

defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad server status",
    description:
      "Returns the current status of the pyLoad download manager: " +
      "active downloads, queue size, download speed, pause state and free disk space.",
    responses: {
      200: { description: "pyLoad status" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  const client = usePyLoadClient();

  try {
    const [status, freeSpace, version] = await Promise.all([
      client.getStatus(),
      client.getFreeSpace().catch(() => null),
      client.getVersion().catch(() => null),
    ]);

    return {
      connected: true,
      status: {
        paused: status.pause,
        active: status.active,
        queue: status.queue,
        total: status.total,
        speed: status.speed,
        speed_fmt: formatSpeed(status.speed), // pyLoad reports bytes/s
        download: status.download,
        reconnect: status.reconnect,
      },
      freeSpace,
      freeSpace_fmt: freeSpace != null ? formatBytes(freeSpace) : null,
      version,
    };
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
