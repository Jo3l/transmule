export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const SUPPORTED_PROVIDER_LANGUAGES = new Set([
    "en",
    "es",
    "it",
    "pt",
    "fr",
    "de",
    "ja",
    "ko",
    "zh",
  ]);

  const body = await readBody<{
    tvdbApiKey?: string;
    tmdbApiKey?: string;
    tvdbLocale?: string;
    tmdbLocale?: string;
  }>(event);

  const normalizeLocale = (value: string): string => {
    const cleaned = value.trim().replace(/_/g, "-");
    if (!cleaned) return "";

    const parts = cleaned.split("-").filter(Boolean);
    const language = parts[0]?.toLowerCase() ?? "";
    if (!/^[a-z]{2,3}$/.test(language)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid locale format",
      });
    }

    const region = parts.find(
      (p, idx) => idx > 0 && /^(?:[a-z]{2}|\d{3})$/i.test(p),
    );
    const normalized = region
      ? `${language}-${region.toUpperCase()}`
      : language;

    if (!SUPPORTED_PROVIDER_LANGUAGES.has(language)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Unsupported locale for provider",
      });
    }

    return normalized;
  };

  if (body?.tvdbApiKey !== undefined) {
    // Empty string clears the key
    setConfig("tvdb_api_key", body.tvdbApiKey.trim());
  }

  if (body?.tmdbApiKey !== undefined) {
    // Empty string clears the key
    setConfig("tmdb_api_key", body.tmdbApiKey.trim());
  }

  if (body?.tvdbLocale !== undefined) {
    setConfig("tvdb_locale", normalizeLocale(body.tvdbLocale));
  }

  if (body?.tmdbLocale !== undefined) {
    setConfig("tmdb_locale", normalizeLocale(body.tmdbLocale));
  }

  return { ok: true };
});
