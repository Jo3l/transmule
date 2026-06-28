defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get conversation messages",
    description: "Returns private messages with a user.",
    responses: { 200: { description: "Messages list" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = getRouterParam(event, "username");
  if (!username) throw createError({ statusCode: 400, statusMessage: "Missing username" });
  try {
    return await client.getConversationMessages(username);
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd conversation error: ${err.message}` });
  }
});
