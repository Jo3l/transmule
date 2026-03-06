defineRouteMeta({
  openAPI: {
    tags: ["Categories"],
    summary: "Category actions",
    description: "Create, update, or delete download categories.",
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
                enum: ["create", "update", "delete"],
                description: "Action to perform",
              },
              id: {
                type: "integer",
                description: "Category ID (update / delete)",
              },
              name: { type: "string", description: "Category name" },
              path: { type: "string", description: "Download path" },
              comment: { type: "string", description: "Comment" },
              color: { type: "integer", description: "Color value" },
              priority: { type: "integer", description: "Priority" },
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
      case "create": {
        if (!body.name) {
          setResponseStatus(event, 400);
          return { error: "Missing 'name' for create action" };
        }
        await client.createCategory({
          name: body.name,
          path: body.path || "",
          comment: body.comment || "",
          color: body.color || 0,
          priority: body.priority || 0,
        });
        return { success: true, action: "create" };
      }

      case "update": {
        if (body.id === undefined) {
          setResponseStatus(event, 400);
          return { error: "Missing 'id' for update action" };
        }
        await client.updateCategory(Number(body.id), {
          name: body.name || "",
          path: body.path || "",
          comment: body.comment || "",
          color: body.color || 0,
          priority: body.priority || 0,
        });
        return { success: true, action: "update" };
      }

      case "delete": {
        if (body.id === undefined) {
          setResponseStatus(event, 400);
          return { error: "Missing 'id' for delete action" };
        }
        await client.deleteCategory(Number(body.id));
        return { success: true, action: "delete" };
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
