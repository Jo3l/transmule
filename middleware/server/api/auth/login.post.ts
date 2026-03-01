defineRouteMeta({
  openAPI: {
    tags: ["aMule Connection"],
    summary: "Connect to aMule",
    description:
      "Force a (re)connection to the aMule daemon via EC protocol. " +
      "The middleware auto-connects on first API call, so this is rarely needed.",
    responses: {
      200: { description: "Connection result" },
      502: { description: "Connection failed" },
    },
  },
});

export default defineEventHandler(async () => {
  const client = useAmuleClient();
  try {
    await client.reconnect();
    return { success: true, connected: true };
  } catch (err: any) {
    setResponseStatus(event, 502);
    return {
      success: false,
      error: err?.message || "Connection failed",
    };
  }
});
