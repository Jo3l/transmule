import { hexToHash } from "../../utils/amule-client";

defineRouteMeta({
  openAPI: {
    tags: ["Shared Files"],
    summary: "Shared file actions",
    description:
      "Reload the shared-files list or change file priority. " +
      "Priority values: 0=Low, 1=Normal, 2=High, 10=Auto.",
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
                enum: ["reload", "setPriority"],
                description: "Action to perform",
              },
              hash: {
                type: "string",
                description: "File hash (hex) — required for setPriority",
              },
              priority: {
                type: "integer",
                description: "Priority value: 0=Low, 1=Normal, 2=High, 10=Auto — required for setPriority",
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
      case "reload":
        await client.reloadSharedFiles();
        return { success: true, action: "reload" };

      case "setPriority": {
        if (!body.hash) {
          setResponseStatus(event, 400);
          return { error: "Missing required field: hash" };
        }
        if (body.priority === undefined || body.priority === null) {
          setResponseStatus(event, 400);
          return { error: "Missing required field: priority" };
        }
        const hashBuf = hexToHash(body.hash);
        await client.setSharedFilePriority(hashBuf, Number(body.priority));
        return { success: true, action: "setPriority", hash: body.hash, priority: Number(body.priority) };
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
