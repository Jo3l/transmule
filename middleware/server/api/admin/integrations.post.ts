export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody<{ tvdbApiKey?: string; tmdbApiKey?: string }>(
    event,
  );

  if (body?.tvdbApiKey !== undefined) {
    // Empty string clears the key
    setConfig("tvdb_api_key", body.tvdbApiKey.trim());
  }

  if (body?.tmdbApiKey !== undefined) {
    // Empty string clears the key
    setConfig("tmdb_api_key", body.tmdbApiKey.trim());
  }

  return { ok: true };
});
