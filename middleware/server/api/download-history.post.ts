import { addDownloadEntry } from "../utils/database";

export default defineEventHandler(async (event) => {
  const userId: number = event.context.user?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
  const body = await readBody(event);
  const { url, title = "", service } = body ?? {};
  if (!url || !service) {
    throw createError({
      statusCode: 400,
      statusMessage: "url and service are required",
    });
  }
  addDownloadEntry(userId, url, title, service);
  return { ok: true };
});
