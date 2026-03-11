export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const body = await readBody(event);
  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      statusMessage: "Body must be a JSON object of key-value pairs",
    });
  }

  const allowed = ["theme", "fileTreeVisible"];
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue;
    setUserPreference(user.userId, key, String(value));
  }

  return { ok: true };
});
