import {
  APP_VERSION_CONFIG_KEY,
  isPresenceEnabled,
  refreshPresenceMarker,
} from "../../utils/slskd-presence";
import { useSlskdClient } from "../../utils/slskd-client";

defineRouteMeta({
  openAPI: {
    tags: ["app"],
    summary: "Report the frontend app version",
    description:
      "Stores the APP_VERSION the SPA is running (the frontend owns the version constant). The presence marker carries it, so this keeps the published version current after an upgrade without waiting for the slskd settings page to be opened.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["version"],
            properties: { version: { type: "string" } },
          },
        },
      },
    },
    responses: {
      200: { description: "Version stored" },
      400: { description: "version is required" },
      403: { description: "Authentication required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const version = typeof body?.version === "string" ? body.version.trim() : "";
  if (!version) {
    throw createError({ statusCode: 400, statusMessage: "version is required" });
  }

  if (getConfig(APP_VERSION_CONFIG_KEY) === version) {
    return { success: true, version, changed: false };
  }

  setConfig(APP_VERSION_CONFIG_KEY, version);

  // El marcador incluye la versión: se reescribe ya (best-effort, slskd puede
  // no estar disponible en este momento — el plugin de presencia lo reintenta).
  if (isPresenceEnabled()) {
    try {
      await refreshPresenceMarker(useSlskdClient());
    } catch (err: any) {
      console.warn("[app] version: no se pudo refrescar el marcador de presencia:", err?.message);
    }
  }

  return { success: true, version, changed: true };
});
