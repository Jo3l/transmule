defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Close a conversation",
    description: "Closes/deletes a private conversation with a user.",
    responses: { 200: { description: "Closed" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = getRouterParam(event, "username");
  if (!username) throw createError({ statusCode: 400, statusMessage: "Missing username" });
  try {
    const ok = await client.closeConversation(username);
    return { success: ok };
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd close conversation error: ${err.message}` });
  }
});
