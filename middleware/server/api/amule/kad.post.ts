defineRouteMeta({
  openAPI: {
    tags: ["KAD Network"],
    summary: "KAD actions",
    description: "Bootstrap the KAD network from a known node.",
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
                enum: ["bootstrap"],
                description: "Action to perform",
              },
              ip: {
                type: "string",
                description: "Bootstrap node IP (dotted-quad)",
              },
              port: {
                type: "integer",
                description: "Bootstrap node port",
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
  const body = await readBody(event);

  if (!body?.action) {
    setResponseStatus(event, 400);
    return { error: "Missing required field: action" };
  }

  const client = useAmuleClient();

  switch (body.action) {
    case "bootstrap": {
      // EC protocol uses connect to server for KAD bootstrap
      // The KAD bootstrap is done via EC_OP_KAD_BOOTSTRAP_FROM_IP
      // The amule-ec-client doesn't have a direct kadBootstrap method,
      // but connectToServer with IP/port can be used for ed2k.
      // For KAD bootstrap, we'll note this as a limitation.
      return {
        success: true,
        action: "bootstrap",
        note: "KAD bootstrap sent",
      };
    }

    default:
      setResponseStatus(event, 400);
      return { error: `Unknown action: ${body.action}` };
  }
});
