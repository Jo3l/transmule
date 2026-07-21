defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Join a chat room",
    description: "Joins a Soulseek chat room.",
    responses: {
      200: { description: "Joined" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const body = await readBody(event);
  const roomName = typeof body === "string" ? body : body?.roomName;

  if (!roomName) {
    throw createError({ statusCode: 400, statusMessage: "roomName is required" });
  }

  try {
    const ok = await client.joinRoom(roomName);
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd join room error: ${err.message}`,
    });
  }
});
