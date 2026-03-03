defineRouteMeta({
  openAPI: {
    tags: ["Categories"],
    summary: "List categories",
    description: "Retrieve all download categories.",
    responses: {
      200: { description: "Category list" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  try {
    const client = useAmuleClient();
    const categories = await client.getCategories();

    return {
      categories: categories.map((c) => ({
        id: c.id ?? 0,
        name: c.name || "",
        path: c.path || "",
        comment: c.comment || "",
        color: c.color ?? 0,
        priority: c.priority ?? 0,
      })),
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
