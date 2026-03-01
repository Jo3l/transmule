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
});
