defineRouteMeta({
  openAPI: {
    tags: ["aMule Connection"],
    summary: "EC connection status",
    description:
      "Check whether the middleware currently holds an active EC connection to aMule.",
    responses: {
      200: {
        description: "Connection status",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                connected: { type: "boolean" },
                reconnecting: { type: "boolean" },
                error: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
});

export default defineEventHandler(() => {
  const client = useAmuleClient();
  return client.connectionInfo;
});
