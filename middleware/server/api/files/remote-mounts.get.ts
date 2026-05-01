/**
 * GET /api/files/remote-mounts
 *
 * Returns the list of configured remote mounts.
 */

import { loadMounts } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "List remote mounts",
    responses: {
      200: { description: "Array of remote mounts" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const mounts = loadMounts().map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    host: m.host,
    share: m.share,
    url: m.url,
    path: m.path,
    domain: m.domain,
    username: m.username,
    // never expose password
  }));

  return mounts;
});
