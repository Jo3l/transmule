defineRouteMeta({
  openAPI: {
    tags: ["Statistics"],
    summary: "Get statistics",
    description:
      "Retrieve aMule statistics: connection info, speeds, network stats.",
    responses: {
      200: { description: "Statistics" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useAmuleClient();

  let stats: Awaited<ReturnType<typeof client.getStats>>;
  try {
    stats = await client.getStats();
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }

  // Derive connection status from stats
  const ed2kConnected = !!stats.connectedServer?.ip;
  const kadId = stats.kadId;

  updateServiceUploadSpeed("amule", stats.uploadSpeed || 0);

  return {
    stats: {
      id: stats.id,
      ed2kId: stats.ed2kId,
      serv_name: stats.connectedServer?.name || "",
      serv_addr: stats.connectedServer
        ? `${stats.connectedServer.ip}:${stats.connectedServer.port}`
        : "",
      uploadSpeed: stats.uploadSpeed || 0,
      uploadSpeed_fmt: formatSpeed(stats.uploadSpeed),
      downloadSpeed: stats.downloadSpeed || 0,
      downloadSpeed_fmt: formatSpeed(stats.downloadSpeed),
      uploadSpeedLimit: stats.uploadSpeedLimit || 0,
      downloadSpeedLimit: stats.downloadSpeedLimit || 0,
      uploadOverhead: stats.uploadOverhead || 0,
      downloadOverhead: stats.downloadOverhead || 0,
      totalSentBytes: stats.totalSentBytes || 0,
      totalSentBytes_fmt: formatBytes(stats.totalSentBytes),
      totalReceivedBytes: stats.totalReceivedBytes || 0,
      totalReceivedBytes_fmt: formatBytes(stats.totalReceivedBytes),
      bannedCount: stats.bannedCount || 0,
      uploadQueueLength: stats.uploadQueueLength || 0,
      totalSourceCount: stats.totalSourceCount || 0,
      sharedFileCount: stats.sharedFileCount || 0,
      ed2kUsers: stats.ed2kUsers || 0,
      kadUsers: stats.kadUsers || 0,
      ed2kFiles: stats.ed2kFiles || 0,
      kadFiles: stats.kadFiles || 0,
      kadNodes: stats.kadNodes || 0,
    },
    connection_status: {
      ed2k: {
        connected: ed2kConnected,
        label: ed2kConnected ? "Connected" : "Disconnected",
        server: stats.connectedServer?.name || null,
      },
      kad: {
        connected: !!kadId,
        label: kadId ? "Connected" : "Disconnected",
        firewalled: false, // EC stats don't expose this directly; use connectionState if available
      },
    },
    log_messages: stats.loggerMessage || [],
  };
});
