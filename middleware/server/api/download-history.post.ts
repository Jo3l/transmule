import { addDownloadEntry } from "../utils/database";

export default defineEventHandler(async (event) => {
  const { userId } = requireUser(event);
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
