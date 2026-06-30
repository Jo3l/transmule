import { loadSmbConfigs, saveSmbConfigs, unmountSmbShare, getSmbConfigById } from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Delete/unmount SMB share",
    parameters: [{ name: "id", in: "path", required: true }],
    responses: { 200: { description: "Mount removed" }, 404: { description: "Not found" } },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id is required" });

  const configs = loadSmbConfigs();
  const idx = configs.findIndex((c) => c.id === id);
  if (idx === -1) throw createError({ statusCode: 404, statusMessage: "Mount not found" });

  const config = configs[idx]!;

  // Unmount the share
  try { unmountSmbShare(config); } catch (err: any) {
    console.error(`[smb] Error unmounting ${config.name}:`, err.message);
  }

  // Remove from config
  configs.splice(idx, 1);
  saveSmbConfigs(configs);

  return { ok: true };
});
