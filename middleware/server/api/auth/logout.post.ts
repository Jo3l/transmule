defineRouteMeta({
  openAPI: {
    tags: ["aMule Connection"],
    summary: "EC connection info",
    description:
      "Get the current EC connection info. " +
      "Note: The EC connection is persistent and managed by the middleware — " +
      "there is no 'logout' concept.",
    responses: {
      200: { description: "Connection info" },
    },
  },
});

export default defineEventHandler(() => {
  const client = useAmuleClient();
  return {
    ...client.connectionInfo,
    note: "EC connections are persistent. Use POST /api/auth/login to force reconnect.",
  };
});
