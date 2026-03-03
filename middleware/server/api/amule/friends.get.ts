defineRouteMeta({
  openAPI: {
    tags: ["Friends / Messages"],
    summary: "List friends",
    description:
      "Retrieve the friend list via the EC getUpdate() endpoint. " +
      "Each friend includes name, hash, IP, port, friend-slot flag, and optional client info.",
    responses: {
      200: { description: "Friends list" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  try {
    const client = useAmuleClient();
    const update = await client.getUpdate();

    const friends = (update.friends || []).map((f) => ({
      name: f.name || "Unknown",
      hash: f.userHashHexString || "",
      ip: f.ip || "",
      port: f.port || 0,
      friendSlot: f.friendSlot ?? false,
      shared: f.shared ?? false,
      client: f.client
        ? {
            clientName: f.client.clientName || "",
            software: f.client.software || "",
            softwareVersion: f.client.softwareVersion || "",
            uploadSpeed: f.client.uploadSpeed || 0,
            uploadSpeed_fmt: formatSpeed(f.client.uploadSpeed),
            downloadSpeed: f.client.downloadSpeed || 0,
            downloadSpeed_fmt: formatSpeed(f.client.downloadSpeed),
          }
        : null,
    }));

    return {
      friends: {
        count: friends.length,
        list: friends,
      },
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
