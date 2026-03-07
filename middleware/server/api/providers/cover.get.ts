/**
 * GET /api/providers/cover?id=showrss&title=Breaking+Bad
 *
 * Calls the cover() method of the specified provider to look up artwork.
 */
import { ensureProviders, getProvider } from "../../providers/loader";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event) as Record<string, string>;
  const id = query.id;
  const title = query.title;

  if (!id || !title) {
    throw createError({
      statusCode: 400,
      statusMessage: "Query params 'id' and 'title' are required",
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

  if (typeof provider.cover !== "function") {
    throw createError({
      statusCode: 400,
      statusMessage: `Provider "${id}" does not support cover()`,
    });
  }

  const coverUrl = await provider.cover(title);
  return { cover: coverUrl };
});
