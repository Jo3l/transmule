export default defineEventHandler((event) => {
  if (!event.context.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }

  const rawKey = getConfig("tvdb_api_key") ?? "";

  return {
    // Never expose the actual key — just whether it's set + a masked preview
    tvdbApiKeySet: rawKey.length > 0,
    tvdbApiKeyPreview: rawKey.length > 4 ? rawKey.slice(0, 4) + "••••••••" : "",
  };
});
