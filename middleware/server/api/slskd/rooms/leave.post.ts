defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Leave a chat room",
    description: "Leaves/disconnects from a joined Soulseek chat room.",
    responses: { 200: { description: "Left" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const body = await readBody(event);
  const roomName = typeof body === "string" ? body : body?.roomName;
  if (!roomName) throw createError({ statusCode: 400, statusMessage: "roomName is required" });
  try {
    const ok = await client.leaveRoom(roomName);
    return { success: ok };
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd leave room error: ${err.message}` });
  }
});
