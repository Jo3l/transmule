defineRouteMeta({
  openAPI: {
    tags: ["Torrents"],
    summary: "Update Transmission session settings",
    description:
      "Update Transmission session configuration via session-set RPC.",
    responses: {
      200: { description: "Settings updated" },
      400: { description: "Invalid request body" },
      502: { description: "Transmission connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Body required" });
  }

  try {
    const client = useTransmissionClient();

    // Separate special actions from session-set fields
    const { _action, ...settings } = body;

    if (_action === "blocklist-update") {
      const size = await client.updateBlocklist();
      return { ok: true, blocklistSize: size };
    }

    if (_action === "port-test") {
      const open = await client.testPort();
      return { ok: true, portIsOpen: open };
    }

    // Regular session-set
    if (Object.keys(settings).length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No settings provided",
      });
    }

    await client.setSession(settings);
    return { ok: true };
  } catch (err: any) {
    if ((err as any).statusCode && (err as any).statusCode < 500) throw err;
    throw createError({
      statusCode: 503,
      statusMessage: `Transmission unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
