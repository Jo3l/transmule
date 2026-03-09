defineRouteMeta({
  openAPI: {
    tags: ["Servers"],
    summary: "List ED2K servers",
    description: "Retrieve the ED2K server list with user / file counts.",
    responses: {
      200: { description: "Server list" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  try {
    const client = useAmuleClient();
    const [servers, stats] = await Promise.all([
      client.getServerList(),
      client.getStats().catch(() => null),
    ]);

    const connectedIp = stats?.connectedServer?.ip || null;
    const connectedPort = stats?.connectedServer?.port ?? null;

    const list = servers.map((s) => ({
      name: s.name || "Unknown",
      desc: s.description || "",
      addr: s.address || `${s.ip || "?"}:${s.port || "?"}`,
      ip: s.ip || "",
      port: s.port || 0,
      users: s.users || 0,
      usersMax: s.maxUsers || 0,
      files: s.files || 0,
      ping: s.ping || 0,
      priority: s.priority ?? 0,
      version: s.version || "",
      isStatic: s.isStatic ?? false,
      failedCount: s.failedCount ?? 0,
      connected:
        connectedIp !== null &&
        s.ip === connectedIp &&
        (s.port || 0) === connectedPort,
    }));

    return {
      servers: {
        count: list.length,
        list,
      },
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
