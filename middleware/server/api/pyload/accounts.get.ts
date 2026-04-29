defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad accounts",
    description:
      "Returns the list of configured accounts in the pyLoad server.",
    responses: {
      200: { description: "Array of account objects" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = usePyLoadClient();

  try {
    const accounts = await client.getAccounts();
    return accounts;
  } catch (err: any) {
    console.error("Failed to fetch pyLoad accounts:", err);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch pyLoad accounts",
    });
  }
});
