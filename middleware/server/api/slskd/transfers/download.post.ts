defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Download files from user",
    description: "Initiates a download of files from a Soulseek user.",
    responses: { 200: { description: "Download started" }, 502: { description: "slskd error" } },
  },
});
export default defineEventHandler(async (event) => {
  requireUser(event);
  const client = useSlskdClient();
  const body = await readBody(event);
  const { username, files } = body;
  if (!username || !files?.length) {
    throw createError({ statusCode: 400, statusMessage: "username and files are required" });
  }
  try {
    const ok = await client.startDownload(username, files);
    return { success: ok };
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd download error: ${err.message}` });
  }
});
