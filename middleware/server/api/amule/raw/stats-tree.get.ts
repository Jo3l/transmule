defineRouteMeta({
  openAPI: {
    tags: ["Raw"],
    summary: "Stats tree",
    description:
      "Stats tree data. Note: EC_OP_GET_STATSTREE is not yet wrapped by the EC client library. " +
      "Use /api/stats for available statistics.",
    responses: {
      200: { description: "Stats tree or placeholder" },
    },
  },
});

export default defineEventHandler(async () => {
  const client = useAmuleClient();
  const stats = await client.getStats();

  // Build a basic stats tree from available data
  return {
    stats_tree: [
      {
        type: "folder",
        label: "Connection",
        children: [
          {
            type: "item",
            label: `Upload Speed: ${formatSpeed(stats.uploadSpeed)}`,
          },
          {
            type: "item",
            label: `Download Speed: ${formatSpeed(stats.downloadSpeed)}`,
          },
          {
            type: "item",
            label: `Upload Limit: ${formatSpeed(stats.uploadSpeedLimit)}`,
          },
          {
            type: "item",
            label: `Download Limit: ${formatSpeed(stats.downloadSpeedLimit)}`,
          },
          {
            type: "item",
            label: `Total Sent: ${formatBytes(stats.totalSentBytes)}`,
          },
          {
            type: "item",
            label: `Total Received: ${formatBytes(stats.totalReceivedBytes)}`,
          },
        ],
      },
      {
        type: "folder",
        label: "Network",
        children: [
          {
            type: "item",
            label: `ED2K Users: ${(stats.ed2kUsers || 0).toLocaleString()}`,
          },
          {
            type: "item",
            label: `ED2K Files: ${(stats.ed2kFiles || 0).toLocaleString()}`,
          },
          {
            type: "item",
            label: `KAD Users: ${(stats.kadUsers || 0).toLocaleString()}`,
          },
          {
            type: "item",
            label: `KAD Files: ${(stats.kadFiles || 0).toLocaleString()}`,
          },
          {
            type: "item",
            label: `KAD Nodes: ${(stats.kadNodes || 0).toLocaleString()}`,
          },
        ],
      },
      {
        type: "folder",
        label: "Clients",
        children: [
          {
            type: "item",
            label: `Total Sources: ${stats.totalSourceCount || 0}`,
          },
          {
            type: "item",
            label: `Upload Queue: ${stats.uploadQueueLength || 0}`,
          },
          { type: "item", label: `Banned: ${stats.bannedCount || 0}` },
          {
            type: "item",
            label: `Shared Files: ${stats.sharedFileCount || 0}`,
          },
        ],
      },
    ],
  };
});
