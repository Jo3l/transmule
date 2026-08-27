export default defineEventHandler((event) => {
  requireAdmin(event);

  const rawTvdbKey = getConfig("tvdb_api_key") ?? "";
  const rawTmdbKey = getConfig("tmdb_api_key") ?? "";
  const rawTvdbLocale = getConfig("tvdb_locale") ?? "";
  const rawTmdbLocale = getConfig("tmdb_locale") ?? "";
  const rawPlexIp = getConfig("plex_ip") ?? "";
  const rawPlexPort = getConfig("plex_port") ?? "";
  const rawPlexToken = getConfig("plex_token") ?? "";

  return {
    // Admin settings UI needs the persisted key for edit/save flows.
    tvdbApiKeySet: rawTvdbKey.length > 0,
    tvdbApiKey: rawTvdbKey,
    tvdbApiKeyPreview:
      rawTvdbKey.length > 4 ? rawTvdbKey.slice(0, 4) + "••••••••" : "",
    tmdbApiKeySet: rawTmdbKey.length > 0,
    tmdbApiKey: rawTmdbKey,
    tmdbApiKeyPreview:
      rawTmdbKey.length > 4 ? rawTmdbKey.slice(0, 4) + "••••••••" : "",
    tvdbLocale: rawTvdbLocale,
    tmdbLocale: rawTmdbLocale,
    plexIp: rawPlexIp,
    plexPort: rawPlexPort,
    plexToken: rawPlexToken,
    plexTokenSet: rawPlexToken.length > 0,
    plexTokenPreview:
      rawPlexToken.length > 4 ? rawPlexToken.slice(0, 4) + "••••••••" : "",
  };
});
