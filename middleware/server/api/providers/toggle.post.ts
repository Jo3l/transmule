/**
 * POST /api/providers/toggle
 *
 * Enable or disable a provider.
 * Body: { id: string, enabled: boolean }
 */
import { ensureProviders, getProvider } from "../../providers/loader";
import { setConfig } from "../../utils/database";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { id, enabled } = body as { id: string; enabled: boolean };

  if (!id || typeof enabled !== "boolean") {
    throw createError({
      statusCode: 400,
      statusMessage: "id and enabled (boolean) are required",
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

  setConfig(`provider_enabled_${id}`, enabled ? "1" : "0");
  return { id, enabled };
});
