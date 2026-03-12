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

  const resolvedUrl = _resolveManifestUrl(body.url.trim());
  assertSafeUrl(resolvedUrl);

  // Fetch and parse the manifest to get the repo name + plugin list
  let repoName: string | undefined;
  let pluginEntries: Array<{ url?: string }> = [];
  try {
    const text = await fetchTextSafe(resolvedUrl);
    const manifest = JSON.parse(text);
    repoName = typeof manifest?.name === "string" ? manifest.name : undefined;
    if (!Array.isArray(manifest?.plugins)) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "Invalid repository manifest. Expected { name, plugins: [...] }",
      });
    }
    pluginEntries = manifest.plugins;
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: `Could not parse repository manifest: ${err.message}`,
    });
  }

  const repo = addPluginRepository(resolvedUrl, repoName);

  // Install all plugins declared in the manifest and link them to this repo.
  // Individual plugin failures are skipped so one bad entry doesn't block the whole repo.
  let installed = 0;
  for (const entry of pluginEntries) {
    if (!entry.url || typeof entry.url !== "string") continue;
    try {
      assertSafeUrl(entry.url);
      await installPluginFromUrl(entry.url, repo.id);
      installed++;
    } catch {
      // skip invalid / unreachable plugin entries
    }
  }

  return { ...repo, installed };
});

/**
 * If the user pastes a GitHub repo URL (https://github.com/owner/repo),
 * rewrite it to the raw manifest URL automatically.
 * Handles variations like trailing slashes or /tree/…/manifest.json paths.
 */
function _resolveManifestUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return url;

    // Strip trailing slash and split path segments
    const parts = u.pathname.replace(/\/$/, "").split("/").filter(Boolean);

    // Exactly https://github.com/{owner}/{repo}  →  raw manifest
    if (parts.length === 2) {
      const [owner, repo] = parts;
      return `https://raw.githubusercontent.com/${owner}/${repo}/main/manifest.json`;
    }

    // https://github.com/{owner}/{repo}/blob/{branch}/manifest.json
    //   →  https://raw.githubusercontent.com/{owner}/{repo}/{branch}/manifest.json
    if (parts.length >= 5 && parts[2] === "blob") {
      const [owner, repo, , branch, ...rest] = parts;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join("/")}`;
    }
  } catch {
    /* not a valid URL — let assertSafeUrl handle it */
  }
  return url;
}
