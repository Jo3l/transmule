import { deleteDownloadEntry } from "../utils/database";

export default defineEventHandler(async (event) => {
  const userId: number = event.context.user?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
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
