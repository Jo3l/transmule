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

export default defineEventHandler(async () => {
  const client = useTransmissionClient();

  const [session, stats, raw] = await Promise.all([
    client.getSession(),
    client.getSessionStats(),
    client.getSessionRaw(),
  ]);

  return { session, stats, raw };
});
