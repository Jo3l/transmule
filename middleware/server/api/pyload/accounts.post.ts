defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "Add or update pyLoad account",
    description:
      "Creates a new pyLoad account or updates an existing one for a given plugin.",
    responses: {
      200: { description: "Account updated" },
      400: { description: "Missing or invalid input" },
      502: { description: "pyLoad connection error" },
    },
  },
});

function normalizeOption(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const plugin = typeof body?.plugin === "string" ? body.plugin.trim() : "";
  const login = typeof body?.login === "string" ? body.login.trim() : "";
  const password =
    typeof body?.password === "string" ? body.password : undefined;

  if (!plugin || !login) {
    throw createError({
      statusCode: 400,
      statusMessage: "plugin and login are required",
    });
  }

  const options: Record<string, string[]> = {};
  const time = normalizeOption(body?.time);
  const limitDl = normalizeOption(body?.limitDl);

  if (time) options.time = [time];
  if (limitDl) options.limit_dl = [limitDl];

  const client = usePyLoadClient();

  try {
    await client.updateAccount(plugin, login, password, options);
    return { ok: true, plugin, login };
  } catch (err: any) {
    console.error("Failed to update pyLoad account:", err);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to update pyLoad account",
    });
  }
});
