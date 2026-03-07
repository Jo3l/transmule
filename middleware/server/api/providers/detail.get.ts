/**
 * GET /api/providers/detail?id=dontorrent-movies&url=...
 *
 * Calls the detail() method of the specified provider.
 */
import { ensureProviders, getProvider } from "../../providers/loader";
import { getConfig } from "../../utils/database";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event) as Record<string, string>;
  const id = query.id;
  const url = query.url;

  if (!id || !url) {
    throw createError({
      statusCode: 400,
      statusMessage: "Query params 'id' and 'url' are required",
    });
  }

  await ensureProviders();
  const provider = getProvider(id);
  if (!provider) {
    throw createError({
      statusCode: 404,
      statusMessage: `Provider "${id}" not found`,
    });
  }

  if (typeof provider.detail !== "function") {
    throw createError({
      statusCode: 400,
      statusMessage: `Provider "${id}" does not support detail()`,
    });
  }

  const enabled = getConfig(`provider_enabled_${id}`);
  if (enabled === "0") {
    throw createError({
      statusCode: 403,
      statusMessage: `Provider "${id}" is disabled`,
    });
  }

  return provider.detail(url);
});
