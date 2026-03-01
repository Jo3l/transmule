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

export default defineEventHandler(async () => {
  const client = useAmuleClient();
  const servers = await client.getServerList();

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
  }));

  return {
    servers: {
      count: list.length,
      list,
    },
  };
});
