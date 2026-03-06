defineRouteMeta({
  openAPI: {
    tags: ["Shared Files"],
    summary: "Shared file actions",
    description: "Reload the shared-files list.",
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
                enum: ["reload"],
                description: "Action to perform",
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Action result" },
      400: { description: "Invalid action" },
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
      case "reload":
        await client.reloadSharedFiles();
        return { success: true, action: "reload" };

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
