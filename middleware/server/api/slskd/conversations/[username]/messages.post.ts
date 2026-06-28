defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Send private message",
    description: "Sends a private message to a user.",
    responses: { 200: { description: "Sent" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = getRouterParam(event, "username");
  if (!username) throw createError({ statusCode: 400, statusMessage: "Missing username" });
  const body = await readBody(event);
  const message = typeof body === "string" ? body : body?.message;
  if (!message) throw createError({ statusCode: 400, statusMessage: "Message is required" });
  try {
    const ok = await client.sendConversationMessage(username, message);
    return { success: ok };
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd send message error: ${err.message}` });
  }
});
