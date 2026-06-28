defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Browse user files",
    description: "Returns directory tree of a user's shared files.",
    responses: { 200: { description: "Browse result" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const username = getRouterParam(event, "username");
  if (!username) throw createError({ statusCode: 400, statusMessage: "Missing username" });
  try {
    return await client.browseUserFiles(username);
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd browse error: ${err.message}` });
  }
});
