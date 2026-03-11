import { deleteDownloadEntry } from "../utils/database";

export default defineEventHandler(async (event) => {
  const { userId } = requireUser(event);
  const body = await readBody(event);
  const id = Number(body?.id);
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }
  const deleted = deleteDownloadEntry(id, userId);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "Entry not found" });
  }
  return { ok: true };
});
