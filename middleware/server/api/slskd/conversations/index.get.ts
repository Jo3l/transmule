defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "List conversations",
    description: "Returns the list of active private conversations.",
    responses: { 200: { description: "Conversation list" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  try {
    return await client.getConversations();
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd conversations error: ${err.message}` });
  }
});
