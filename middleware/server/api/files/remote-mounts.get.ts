import { loadSmbConfigs } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "List SMB mounts",
    responses: { 200: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  return loadSmbConfigs().map((c) => ({
    id: c.id, name: c.name, host: c.host, share: c.share,
    path: c.path, domain: c.domain, username: c.username, readOnly: c.readOnly,
  }));
});
