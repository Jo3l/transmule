defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "List joined chat rooms",
    description: "Returns the currently joined Soulseek chat rooms.",
    responses: {
      200: { description: "Joined room names" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const rooms = await client.getJoinedRooms();
    return rooms;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd joined rooms error: ${err.message}`,
    });
  }
});
