import { loadSmbConfigs, saveSmbConfigs } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Delete SMB mount",
    parameters: [{ name: "id", in: "path", required: true }],
    responses: { 200: {}, 404: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });

  const configs = loadSmbConfigs();
  const idx = configs.findIndex((c) => c.id === id);
  if (idx === -1) throw createError({ statusCode: 404, statusMessage: "Mount not found" });

  configs.splice(idx, 1);
  saveSmbConfigs(configs);
  return { ok: true };
});
