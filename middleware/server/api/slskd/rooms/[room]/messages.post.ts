defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Send room message",
    description: "Sends a message to a Soulseek chat room.",
    responses: {
      200: { description: "Sent" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const roomName = getRouterParam(event, "room");
  const body = await readBody(event);

  if (!roomName) {
    throw createError({ statusCode: 400, statusMessage: "Missing room name" });
  }

  const message = typeof body === "string" ? body : body?.message;
  if (!message) {
    throw createError({ statusCode: 400, statusMessage: "message is required" });
  }

  try {
    const ok = await client.sendRoomMessage(roomName, message);
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd room message error: ${err.message}`,
    });
  }
});
