defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Save slskd Soulseek credentials",
    description:
      "Saves the Soulseek username and password to the database and applies them to slskd (admin only).",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              username: { type: "string" },
              password: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Credentials saved and applied" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody(event);

  if (body?.username !== undefined) {
    setConfig("slskd_username", body.username);
  }
  if (body?.password !== undefined) {
    setConfig("slskd_password", body.password);
  }

  // Apply credentials and all config to the running slskd instance
  if (body?.username || body?.password) {
    try {
      const client = useSlskdClient();
      await client.disconnect("credentials updated — reconnecting");
      await client.connect();
    } catch (err) {
      console.warn("[settings] slskd: apply credentials failed (slskd may be unreachable):", err);
    }
  }

  return { success: true };
});
