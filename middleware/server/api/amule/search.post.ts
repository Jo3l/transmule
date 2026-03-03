defineRouteMeta({
  openAPI: {
    tags: ["Search"],
    summary: "Search actions",
    description:
      "Start a new file search, stop the current search, or download files from the current search results.",
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
                enum: ["search", "download", "stop"],
                description: "Action to perform",
              },
              query: {
                type: "string",
                description: "Search query text (action = search)",
              },
              type: {
                type: "string",
                enum: ["Local", "Global", "KAD"],
                default: "Global",
                description: "Search scope (action = search)",
              },
              avail: {
                type: "integer",
                description: "Minimum source availability",
              },
              min_size: {
                type: "number",
                description: "Minimum file size (bytes)",
              },
              max_size: {
                type: "number",
                description: "Maximum file size (bytes)",
              },
              file_type: { type: "string", description: "File type filter" },
              extension: {
                type: "string",
                description: "File extension filter",
              },
              hashes: {
                type: "array",
                items: { type: "string" },
                description:
                  "File hashes to download from search results (action = download)",
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
      case "search": {
        if (!body.query) {
          setResponseStatus(event, 400);
          return { error: "Missing 'query' for search action" };
        }

        // Map type string to SearchType enum
        const typeMap: Record<string, SearchType> = {
          Local: SearchType.LOCAL,
          Global: SearchType.GLOBAL,
          KAD: SearchType.KAD,
        };
        const searchType = typeMap[body.type] ?? SearchType.GLOBAL;

        const filters: Record<string, any> = {};
        if (body.avail) filters.minAvailability = Number(body.avail);
        if (body.min_size) filters.minSize = Number(body.min_size);
        if (body.max_size) filters.maxSize = Number(body.max_size);
        if (body.file_type) filters.fileType = body.file_type;
        if (body.extension) filters.extension = body.extension;

        await client.searchAsync(body.query, searchType, filters);
        return { success: true, action: "search", query: body.query };
      }

      case "download": {
        if (!Array.isArray(body.hashes) || body.hashes.length === 0) {
          setResponseStatus(event, 400);
          return { error: "Missing 'hashes' array for download action" };
        }
        for (const hash of body.hashes) {
          await client.downloadSearchResult(hexToHash(hash));
        }
        return { success: true, action: "download", count: body.hashes.length };
      }

      case "stop":
        await client.searchStop();
        return { success: true, action: "stop" };

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
