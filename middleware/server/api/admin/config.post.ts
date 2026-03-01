defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Update aMule connection config",
    description:
      "Update the aMule EC host, port, and/or password stored in the database (admin only). " +
      "After saving, the middleware will reconnect to aMule with the new settings.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              amuleHost: {
                type: "string",
                description: "aMule host/IP address",
              },
              amulePort: {
                type: "integer",
                description: "aMule EC port (default: 4712)",
              },
              amulePassword: {
                type: "string",
                description: "aMule EC password",
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Config updated" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  if (!event.context.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  const body = await readBody(event);

  if (body?.amuleHost) {
    setConfig("amule_host", body.amuleHost);
  }
  if (body?.amulePort !== undefined) {
    setConfig("amule_port", String(body.amulePort));
  }
  if (body?.amulePassword !== undefined) {
    setConfig("amule_password", body.amulePassword);
  }

  // Reset the singleton so it picks up new config on next call
  resetAmuleClient();

  return { success: true };
});
