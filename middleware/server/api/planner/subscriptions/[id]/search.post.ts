/**
 * POST /api/planner/subscriptions/:id/search
 *
 * Busca manualmente releases para una subscription.
 *
 * Fase 3: registra la intención en planner_search_history con status='pending'.
 * Fase 7 (Search & grab): este endpoint dispara searchAndGrab() real contra
 * los search providers habilitados.
 */
import { getSubscription, recordSearchHistory } from "~/utils/planner-db";
import { searchAndGrabSubscription, searchAndGrabMovie } from "~/plugins/planner-scheduler";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Manual search for subscription",
    description:
      "Queues a manual search for a subscription (episodes or movie) against enabled search services.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["all", "missing", "episode"], default: "missing" },
              season: { type: "integer", nullable: true },
              episode: { type: "integer", nullable: true },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Search queued" },
      401: { description: "Auth required" },
      404: { description: "Not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const id = Number(getRouterParam(event, "id"));
  if (!Number.isFinite(id)) {
    setResponseStatus(event, 400);
    return { error: "Invalid id" };
  }
  const sub = getSubscription(id);
  if (!sub) {
    setResponseStatus(event, 404);
    return { error: "Subscription not found" };
  }

  const body = await readBody(event);
  const kind = body?.kind ?? "missing";
  const now = new Date().toISOString();

  // Registrar la intención (historial). La búsqueda real se ejecuta en Fase 7.
  recordSearchHistory({
    subscription_id: id,
    episode_id: body?.episode ? Number(body.episode) : null,
    movie_id: sub.type === "movie" ? id : null,
    service: "planner",
    search_kind: "manual",
    query: sub.title,
    results_count: null,
    picked_release: null,
    picked_title: null,
    picked_quality: null,
    picked_size_mb: null,
    picked_hash: null,
    picked_seeds: null,
    picked_at: now,
    status: "pending",
    error_message: null,
  });

  // Buscar y descargar (en background): series → episodios emitidos; película → mejor release.
  if (sub.type === "series" && kind !== "episode") {
    searchAndGrabSubscription(id).catch((err: any) => {
      console.error("[planner] subscription search error:", err?.message ?? err);
    });
  } else if (sub.type === "movie") {
    searchAndGrabMovie(id).catch((err: any) => {
      console.error("[planner] movie search error:", err?.message ?? err);
    });
  }

  return { ok: true, queued: true, kind };
});
