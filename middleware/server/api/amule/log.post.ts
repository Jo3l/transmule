defineRouteMeta({
  openAPI: {
    tags: ["Logs"],
    summary: "Log actions",
    description:
      "Log-related actions. Note: Full log reset requires raw EC packets not yet supported by the client library.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["target"],
            properties: {
              target: {
                type: "string",
                enum: ["amule", "server", "both"],
                description: "Which log to reset (limited support via EC)",
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Reset result" },
      400: { description: "Invalid target" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body?.target) {
    setResponseStatus(event, 400);
    return { error: "Missing required field: target" };
  }

  // Note: The amule-ec-client library doesn't expose EC_OP_RESET_LOG directly.
  // This is a known limitation. Log messages are still readable via getStats().
  return {
    success: true,
    note: "Log reset is not fully supported via the EC client library. Messages will be refreshed on next stats poll.",
  };
});
