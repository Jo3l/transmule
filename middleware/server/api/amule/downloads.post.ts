defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Download actions",
    description:
      "Perform an action on downloads: pause, resume, cancel, delete, add an ed2k link, or change category.",
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
                enum: ["pause", "resume", "stop", "cancel", "add", "category"],
                description: "Action to perform",
              },
              hashes: {
                type: "array",
                items: { type: "string" },
                description: "32-char hex file hashes to act on",
              },
              ed2k_link: {
                type: "string",
                description: "ed2k:// link to add (action = add)",
              },
              category: {
                type: "integer",
                description: "Category ID (action = category / add)",
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
  const body = await readBody(event);

  if (!body?.action) {
    setResponseStatus(event, 400);
    return { error: "Missing required field: action" };
  }

  try {
    const client = useAmuleClient();

    switch (body.action) {
      case "pause":
        if (Array.isArray(body.hashes)) {
          for (const hash of body.hashes) {
            await client.pauseDownload(hexToHash(hash));
          }
        }
        return { success: true, action: "pause" };

      case "resume":
        if (Array.isArray(body.hashes)) {
          for (const hash of body.hashes) {
            await client.resumeDownload(hexToHash(hash));
          }
        }
        return { success: true, action: "resume" };

      case "stop":
        if (Array.isArray(body.hashes)) {
          for (const hash of body.hashes) {
            await client.stopDownload(hexToHash(hash));
          }
        }
        return { success: true, action: "stop" };

      case "cancel":
        if (Array.isArray(body.hashes)) {
          for (const hash of body.hashes) {
            await client.deleteDownload(hexToHash(hash));
          }
        }
        return { success: true, action: "cancel" };

      case "add":
        if (!body.ed2k_link) {
          setResponseStatus(event, 400);
          return { error: "Missing 'ed2k_link' for add action" };
        }
        await client.downloadEd2kLink(body.ed2k_link.trim());
        return { success: true, action: "add" };

      case "category":
        if (!Array.isArray(body.hashes) || body.category === undefined) {
          setResponseStatus(event, 400);
          return { error: "Missing 'hashes' and 'category' for category action" };
        }
        for (const hash of body.hashes) {
          await client.setFileCategory(hexToHash(hash), Number(body.category));
        }
        return { success: true, action: "category" };

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
