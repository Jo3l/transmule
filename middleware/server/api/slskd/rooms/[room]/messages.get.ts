defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get room messages",
    description: "Returns messages for a joined Soulseek chat room.",
    responses: {
      200: { description: "Messages list" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const roomName = getRouterParam(event, "room");

  if (!roomName) {
    throw createError({ statusCode: 400, statusMessage: "Missing room name" });
  }

  try {
    const messages = await client.getRoomMessages(roomName);
    return messages;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd room messages error: ${err.message}`,
    });
  }
});
