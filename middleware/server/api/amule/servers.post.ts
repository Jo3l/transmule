defineRouteMeta({
  openAPI: {
    tags: ["Servers"],
    summary: "Server actions",
    description: "Connect to, disconnect from, or remove an ED2K server.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["action"],
            properties: {
              action: {
                type: "string",
                enum: ["connect", "disconnect"],
                description: "Action to perform",
              },
              ip: {
                type: "string",
                description: "Server IP (connect)",
              },
              port: {
                type: "integer",
                description: "Server port (connect)",
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Action result" },
      400: { description: "Invalid action or missing parameters" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);

  if (!body?.action) {
    setResponseStatus(event, 400);
    return { error: "Missing required field: action" };
  }

  try {
    const client = useAmuleClient();

    switch (body.action) {
      case "connect":
        await client.connectToServer(
          body.ip,
          body.port ? Number(body.port) : undefined,
        );
        return { success: true, action: "connect" };

      case "disconnect":
        await client.disconnectFromServer();
        return { success: true, action: "disconnect" };

      case "update-from-url": {
        if (!body.url) {
          setResponseStatus(event, 400);
          return { error: "Missing url field for update-from-url" };
        }
        await client.updateServerListFromUrl(body.url);
        return { success: true, action: "update-from-url" };
      }

      default:
        setResponseStatus(event, 400);
        return { error: `Unknown action: ${body.action}` };
    }
  } catch (err: any) {
    if ((err as any).statusCode && (err as any).statusCode < 500) throw err;
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
