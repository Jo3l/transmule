defineRouteMeta({
  openAPI: {
    tags: ["Torrents"],
    summary: "Transmission session info & stats",
    description:
      "Return Transmission session configuration and live statistics.",
    responses: {
      200: { description: "Session info and stats" },
      502: { description: "Transmission connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useTransmissionClient();

  let session: any, stats: any, raw: any;
  try {
    [session, stats, raw] = await Promise.all([
      client.getSession(),
      client.getSessionStats(),
      client.getSessionRaw(),
    ]);
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `Transmission unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }

  return { session, stats, raw };
});
