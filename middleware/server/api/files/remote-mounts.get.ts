import { loadSmbConfigs } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "List SMB mounts",
    responses: { 200: { description: "Array of SMB mounts" } },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const configs = loadSmbConfigs().map((c) => ({
    id: c.id, name: c.name, host: c.host, share: c.share,
    path: c.path, domain: c.domain, username: c.username,
    readOnly: c.readOnly,
    // never expose password
  }));
  return configs;
});
