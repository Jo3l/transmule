export default defineEventHandler((event) => {
  requireAdmin(event);

  const rawTvdbKey = getConfig("tvdb_api_key") ?? "";
  const rawTmdbKey = getConfig("tmdb_api_key") ?? "";

  return {
    // Never expose the actual key — just whether it's set + a masked preview
    tvdbApiKeySet: rawTvdbKey.length > 0,
    tvdbApiKeyPreview:
      rawTvdbKey.length > 4 ? rawTvdbKey.slice(0, 4) + "••••••••" : "",
    tmdbApiKeySet: rawTmdbKey.length > 0,
    tmdbApiKeyPreview:
      rawTmdbKey.length > 4 ? rawTmdbKey.slice(0, 4) + "••••••••" : "",
  };
});
