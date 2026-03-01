defineRouteMeta({
  openAPI: {
    tags: ["Preferences"],
    summary: "Get aMule preferences",
    description:
      "Retrieve current aMule daemon preferences (General, Connection, Servers, Security) via EC protocol.",
    responses: {
      200: { description: "Current preferences" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  const client = useAmuleClient();
  return await client.getPreferences();
});
