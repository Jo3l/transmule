import {
  APP_VERSION_CONFIG_KEY,
  PRESENCE_CONFIG_KEY,
  applyPresence,
  isPresenceEnabled,
} from "../../utils/slskd-presence";

defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Enable or disable Soulseek presence",
    description:
      "Stores the presence switch (admin only), writes the marker and the channel into slskd's config file and joins or leaves the channel.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              version: { type: "string", description: "APP_VERSION reported by the frontend" },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Presence applied" },
      400: { description: "enabled is required" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody(event);
  if (typeof body?.enabled !== "boolean") {
    throw createError({ statusCode: 400, statusMessage: "enabled is required" });
  }

  // The frontend owns the version constant; the marker needs it to keep working
  // from the background refresh, which never talks to the browser.
  if (typeof body?.version === "string" && body.version.trim()) {
    setConfig(APP_VERSION_CONFIG_KEY, body.version.trim());
  }
  setConfig(PRESENCE_CONFIG_KEY, body.enabled ? "1" : "0");

  const client = useSlskdClient();
  let state: any = null;

  // The switch is already persisted, so a slskd hiccup must not fail the save:
  // connect() re-applies the same config on the next startup.
  try {
    state = await applyPresence(client, body.enabled);
  } catch (err: any) {
    console.warn("[settings] slskd: applying presence failed (slskd may be unreachable):", err?.message);
  }

  return { success: true, enabled: isPresenceEnabled(), ...(state ?? {}) };
});
