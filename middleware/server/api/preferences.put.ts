import { setUserPreference } from "../utils/database";

export default defineEventHandler(async (event) => {
  const userId: number = event.context.user?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = await readBody<Record<string, string>>(event);
  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      statusMessage: "Body must be a JSON object",
    });
  }

  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") continue;
    setUserPreference(userId, key, value);
  }

  return { ok: true };
});
