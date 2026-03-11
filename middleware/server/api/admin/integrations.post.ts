export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody<{ tvdbApiKey?: string }>(event);

  if (body?.tvdbApiKey !== undefined) {
    // Empty string clears the key
    setConfig("tvdb_api_key", body.tvdbApiKey.trim());
  }

  return { ok: true };
});
