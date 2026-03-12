/**
 * POST /api/providers/install-url
 *
 * Install (or update) a plugin from a remote HTTPS URL.
 * The file is fetched, validated like a manual upload, and saved to the
 * plugins directory. If a plugin with the same id already exists it is
 * replaced. Admin only.
 *
 * Body: { url: string }
 */
import { installPluginFromUrl } from "../../utils/plugin-install";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  const body = await readBody<{ url?: string }>(event);
  if (!body?.url) {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }

  const result = await installPluginFromUrl(body.url.trim());
  return { ok: true, ...result };
});
