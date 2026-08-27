/**
 * POST /api/plex/refresh
 *
 * Fuerza a Plex a reescanear todas las librerías de películas y series
 * (equivalente a pulsar "Scan Library Files" en Plex).
 */
import { getPlexCredentials, refreshPlexLibraries } from "~/services/plex";

defineRouteMeta({
  openAPI: {
    tags: ["Plex"],
    summary: "Plex library rescan",
    description: "Fuerza el rescan de las librerías de Plex.",
    responses: {
      200: { description: "Rescan triggered" },
      400: { description: "Plex not configured" },
      401: { description: "Auth required" },
      502: { description: "Plex connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  if (!getPlexCredentials()) {
    setResponseStatus(event, 400);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await refreshPlexLibraries();
    return { ok: true, refreshed: res.refreshed, total: res.total };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Plex: ${err?.message ?? err}`,
    });
  }
});