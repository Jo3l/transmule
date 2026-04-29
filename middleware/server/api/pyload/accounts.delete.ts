defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "Delete pyLoad account",
    description: "Deletes an existing pyLoad account from a plugin.",
    responses: {
      200: { description: "Account deleted" },
      400: { description: "Missing or invalid input" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const plugin = typeof body?.plugin === "string" ? body.plugin.trim() : "";
  const login = typeof body?.login === "string" ? body.login.trim() : "";

  if (!plugin || !login) {
    throw createError({
      statusCode: 400,
      statusMessage: "plugin and login are required",
    });
  }

  const client = usePyLoadClient();

  try {
    await client.removeAccount(plugin, login);
    return { ok: true, plugin, login };
  } catch (err: any) {
    console.error("Failed to delete pyLoad account:", err);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to delete pyLoad account",
    });
  }
});
