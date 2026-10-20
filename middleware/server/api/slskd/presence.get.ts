import {
  MARKER_PREFIX,
  PRESENCE_ROOM,
  buildMarker,
  getAppVersion,
  isPresenceEnabled,
} from "../../utils/slskd-presence";

defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get Soulseek presence state",
    description:
      "Whether this instance publishes the TransMule marker in its Soulseek description and auto-joins the Transmule channel, plus the marker that would be published.",
    responses: {
      200: { description: "Presence state" },
      403: { description: "Authentication required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const version = getAppVersion();
  let joined = false;

  // slskd being unreachable is reported as "not joined" instead of a 502: this
  // is a status payload and the settings page must keep rendering.
  try {
    const rooms = await client.getJoinedRooms();
    joined = (rooms ?? []).some(
      (room: any) => String(room).toLowerCase() === PRESENCE_ROOM.toLowerCase(),
    );
  } catch (err: any) {
    console.warn("[slskd] presence: cannot read joined rooms:", err?.message);
  }

  return {
    enabled: isPresenceEnabled(),
    room: PRESENCE_ROOM,
    markerPrefix: MARKER_PREFIX,
    version,
    marker: buildMarker(version),
    joined,
  };
});
