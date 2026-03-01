defineRouteMeta({
  openAPI: {
    tags: ["Raw"],
    summary: "Raw log content",
    description: "Return log messages from the aMule EC stats endpoint.",
    responses: {
      200: { description: "Raw log data" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  const client = useAmuleClient();
  const stats = await client.getStats();
  return {
    messages: stats.loggerMessage || [],
    text: (stats.loggerMessage || []).join("\n"),
  };
});
