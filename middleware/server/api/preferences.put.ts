import { setUserPreference } from "../utils/database";

export default defineEventHandler(async (event) => {
  const { userId } = requireUser(event);

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
