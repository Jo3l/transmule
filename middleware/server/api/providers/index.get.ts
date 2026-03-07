/**
 * GET /api/providers
 *
 * Returns the list of all registered media providers with their metadata
 * and enabled/disabled status.
 */
import { ensureProviders, getAllProviders } from "../../providers/loader";
import { getConfig } from "../../utils/database";

export default defineEventHandler(async (event) => {
  requireUser(event);

  await ensureProviders();
  const providers = getAllProviders();

  return providers.map((p) => {
    const enabled = getConfig(`provider_enabled_${p.meta.id}`);
    return {
      ...p.meta,
      enabled: enabled !== "0", // enabled by default unless explicitly disabled
      hasDetail: typeof p.detail === "function",
      hasCover: typeof p.cover === "function",
      filters: p.filters ?? [],
    };
  });
});
