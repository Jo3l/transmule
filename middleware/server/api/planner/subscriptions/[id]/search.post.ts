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
import { useDatabase } from "~/utils/database";

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

  const db = useDatabase();
  // Marcar episodios wanted si kind=missing (los que no tienen file_path)
  if (sub.type === "series" && kind !== "episode") {
    db.prepare(
      `UPDATE planner_episodes
       SET status = 'wanted', last_search_at = ?
       WHERE subscription_id = ? AND monitored = 1
         AND status NOT IN ('downloaded', 'grabbed')
         AND file_path IS NULL`,
    ).run(now, id);
  }

  return {
    ok: true,
    queued: true,
    kind,
    note: "Search execution arrives in Fase 7 (Search & grab). History entry recorded as pending.",
  };
});
