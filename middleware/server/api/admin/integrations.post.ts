export default defineEventHandler(async (event) => {
  if (!event.context.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }

  const body = await readBody<{ tvdbApiKey?: string }>(event);

  if (body?.tvdbApiKey !== undefined) {
    // Empty string clears the key
    setConfig("tvdb_api_key", body.tvdbApiKey.trim());
  }

  return { ok: true };
});
