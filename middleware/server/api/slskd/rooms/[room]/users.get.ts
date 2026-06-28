defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get room users",
    description: "Returns users in a joined Soulseek chat room.",
    responses: {
      200: { description: "Users list" },
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
    const users = await client.getRoomUsers(roomName);
    return users;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd room users error: ${err.message}`,
    });
  }
});
