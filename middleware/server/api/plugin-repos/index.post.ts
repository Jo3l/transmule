/**
 * POST /api/plugin-repos
 *
 * Add a plugin repository URL. Fetches the manifest to validate it and
 * capture the repository name. Admin only.
 *
 * Body: { url: string }
 */
import { addPluginRepository } from "../../utils/database";
import { fetchTextSafe, assertSafeUrl } from "../../utils/plugin-url";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Admin access required" });
  }

  const body = await readBody<{ url?: string }>(event);
  if (!body?.url) {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }

  assertSafeUrl(body.url.trim());

  // Fetch and parse the manifest to get the repo name
  let repoName: string | undefined;
  try {
    const text = await fetchTextSafe(body.url.trim());
    const manifest = JSON.parse(text);
    repoName = typeof manifest?.name === "string" ? manifest.name : undefined;
    if (!Array.isArray(manifest?.plugins)) {
      throw createError({
        statusCode: 422,
        statusMessage:
          'Invalid repository manifest. Expected { name, plugins: [...] }',
      });
    }
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: `Could not parse repository manifest: ${err.message}`,
    });
  }

  const repo = addPluginRepository(body.url.trim(), repoName);
  return repo;
});
