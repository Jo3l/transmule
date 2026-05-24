import { addDownloadEntry } from "../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Download History"],
    summary: "Record a download",
    responses: {
      200: { description: "Recorded" },
      400: { description: "Missing url" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { userId } = requireUser(event);
  const { url, title, service } = await readBody(event);

  if (!url || typeof url !== "string") {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }

  addDownloadEntry(userId, url, title || null, service || "transmission");
  return { ok: true };
});
