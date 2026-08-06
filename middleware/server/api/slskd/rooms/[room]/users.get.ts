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
  const roomName = decodeURIComponent(getRouterParam(event, "room") ?? "");

  if (!roomName) {
    throw createError({ statusCode: 400, statusMessage: "room is required" });
  }

  try {
    const users = await client.getRoomUsers(roomName);
    // Deduplicate by username — slskd can report the same user multiple times
    // if the Soulseek network fires duplicate UserJoinedRoom events.
    const seen = new Set<string>();
    const deduped = (users ?? []).filter((u: any) => {
      const key = u.username ?? u;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd room users error: ${err.message}`,
    });
  }
});
