defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "List available chat rooms",
    description: "Returns all available Soulseek chat rooms.",
    responses: {
      200: { description: "Room list" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const rooms = await client.getAvailableRooms();
    return rooms;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd rooms error: ${err.message}`,
    });
  }
});
