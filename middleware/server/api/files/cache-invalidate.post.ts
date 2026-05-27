import { invalidateTreeCache } from "~/utils/treeCache";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const reason = getQuery(event).reason || "unknown";
  console.log(`[file-cache] Invalidating tree cache: ${reason}`);

  invalidateTreeCache();

  return { ok: true };
});
