defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get user info",
    description: "Returns merged info about a Soulseek user (info + status + endpoint).",
    responses: { 200: { description: "User info" }, 502: { description: "slskd error" } },
  },
});

// slskd distributes user data across three endpoints; merge them like the official UI does.
async function getMergedUserInfo(client: any, username: string) {
  const [info, status, endpoint] = await Promise.all([
    client.getUserInfo(username),
    client.getUserStatus(username),
    // getUserEndpoint is not yet in the client, but status + info gives us what we need
  ]);
  return {
    ...(info || {}),
    ...(status || {}),
    ...(endpoint || {}),
  };
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = getRouterParam(event, "username");
  if (!username) throw createError({ statusCode: 400, statusMessage: "Missing username" });
  try {
    return await getMergedUserInfo(client, username);
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd user info error: ${err.message}` });
  }
});
