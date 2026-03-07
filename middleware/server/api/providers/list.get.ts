/**
 * GET /api/providers/list?id=yts&page=1&...
 *
 * Calls the list() method of the specified provider, forwarding all
 * query-string parameters as ProviderSearchParams.
 */
import { ensureProviders, getProvider } from "../../providers/loader";
import { getConfig } from "../../utils/database";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event) as Record<string, string>;
  const id = query.id;
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Query param 'id' is required",
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

  // Check enabled
  const enabled = getConfig(`provider_enabled_${id}`);
  if (enabled === "0") {
    throw createError({
      statusCode: 403,
      statusMessage: `Provider "${id}" is disabled`,
    });
  }

  const { id: _id, ...params } = query;
  const page = params.page ? Number(params.page) : 1;

  return provider.list({ ...params, page });
});
