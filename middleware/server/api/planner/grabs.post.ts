/**
 * POST /api/planner/grabs
 *
 * Grab manual (Fase 14): encola un release elegido por el usuario desde la
 * búsqueda interactiva, y marca el episodio/película como 'grabbed'. El
 * grab-worker (cada 30 s) lo despacha al cliente de descarga correspondiente.
 *
 * Body:
 *   subscription_id: number
 *   episode_id?: number | null
 *   movie_id?: number | null
 *   release_title: string
 *   release_url: string        (magnet / ed2k / slskd://...)
 *   release_hash?: string | null
 *   release_quality?: string | null
 *   release_size_mb?: number | null
 *   release_seeds?: number | null
 *   service: string            ('direct-plugin' | 'slskd' | 'amule')
 */
import {
  enqueueGrab,
  updateEpisode,
  getSubscription,
} from "~/utils/planner-db";
import { useDatabase } from "~/utils/database";
import { refreshSeriesEpisodes } from "~/services/planner/metadata-sync";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Manual grab of a chosen release",
    description:
      "Enqueues a user-chosen release for download and marks the episode/movie as grabbed.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["subscription_id", "release_url"],
            properties: {
              subscription_id: { type: "integer" },
              episode_id: { type: "integer", nullable: true },
              movie_id: { type: "integer", nullable: true },
              release_title: { type: "string", nullable: true },
              release_url: { type: "string" },
              release_hash: { type: "string", nullable: true },
              release_quality: { type: "string", nullable: true },
              release_size_mb: { type: "integer", nullable: true },
              release_seeds: { type: "integer", nullable: true },
              service: { type: "string" },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Grab enqueued" },
      400: { description: "Invalid input" },
      401: { description: "Auth required" },
      404: { description: "Subscription not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);

  const subscriptionId = Number(body?.subscription_id);
  if (!Number.isFinite(subscriptionId)) {
    setResponseStatus(event, 400);
    return { error: "subscription_id is required" };
  }
  const sub = getSubscription(subscriptionId);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }

  const releaseUrl = String(body?.release_url ?? "").trim();
  if (!releaseUrl) {
    setResponseStatus(event, 400);
    return { error: "release_url is required" };
  }

  const episodeId = body?.episode_id != null ? Number(body.episode_id) : null;
  const movieId = body?.movie_id != null ? Number(body.movie_id) : null;
  if (episodeId == null && movieId == null) {
    setResponseStatus(event, 400);
    return { error: "episode_id or movie_id is required" };
  }

  // Refrescar metadata de la serie antes de descargar: el título del episodio
  // debe quedar actualizado en la BD para el post-proceso (smart rename, Plex).
  // No bloquea la descarga: refreshSeriesEpisodes traga los errores.
  if (sub.type === "series" && episodeId != null) {
    await refreshSeriesEpisodes(sub, { force: true });
  }

  const grab = enqueueGrab({
    subscription_id: subscriptionId,
    episode_id: episodeId,
    movie_id: movieId,
    release_title: body?.release_title ?? null,
    release_url: releaseUrl,
    release_hash: body?.release_hash ?? null,
    release_quality: body?.release_quality ?? null,
    release_size_mb: body?.release_size_mb != null ? Number(body.release_size_mb) : null,
    release_seeds: body?.release_seeds != null ? Number(body.release_seeds) : null,
    service: String(body?.service ?? "direct-plugin"),
    priority: "manual",
  });

  const now = new Date().toISOString();
  if (episodeId != null) {
    updateEpisode(episodeId, { status: "grabbed", grabbed_at: now });
  }
  if (movieId != null) {
    useDatabase()
      .prepare("UPDATE planner_movies SET status = 'grabbed', grabbed_at = ? WHERE id = ?")
      .run(now, movieId);
  }

  return { ok: true, queued: true, grab: grab.id };
});
