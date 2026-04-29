defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad account types",
    description: "Returns available pyLoad account plugin types.",
    responses: {
      200: { description: "Array of account plugin names" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = usePyLoadClient();

  try {
    const types = await client.getAccountTypes();
    return types;
  } catch (err: any) {
    console.error("Failed to fetch pyLoad account types:", err);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch pyLoad account types",
    });
  }
});
