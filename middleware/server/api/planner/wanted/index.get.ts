/**
 * GET /api/planner/wanted?type=missing
 *
 * Episodios wanted (emitidos, sin descargar, monitored).
 * type=missing → status='wanted'; type=cutoff_unmet → status='cutoff_unmet'.
 */
import { getWantedEpisodes } from "~/utils/planner-db";
import { useDatabase } from "~/utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Wanted episodes",
    description: "Returns wanted (missing) or cutoff-unmet episodes.",
    responses: {
      200: { description: "Array of episodes" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as { type?: string };
  const type = q.type === "cutoff_unmet" ? "cutoff_unmet" : "wanted";

  if (type === "wanted") {
    return { episodes: getWantedEpisodes(), type };
  }

  const db = useDatabase();
  const rows = db
    .prepare(
      `SELECT e.*, s.title AS subscription_title, s.poster_url AS subscription_poster
       FROM planner_episodes e
       JOIN planner_subscriptions s ON s.id = e.subscription_id
       WHERE e.status = 'cutoff_unmet' AND e.monitored = 1 AND s.monitored = 1
       ORDER BY e.air_date ASC`,
    )
    .all() as unknown as Record<string, unknown>[];
  return { episodes: rows, type };
});
