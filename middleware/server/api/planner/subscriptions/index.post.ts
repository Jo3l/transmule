/**
 * POST /api/planner/subscriptions
 *
 * Crea una subscription (serie o película).
 *
 * Para series: tipo='series', tvdb_id o tmdb_id, min_quality, monitored scope.
 * Para movies: tipo='movie', tmdb_id, min_quality.
 */
import { createSubscription } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Create subscription",
    description: "Creates a planner subscription (series or movie).",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["type", "title", "root_folder"],
            properties: {
              type: { type: "string", enum: ["series", "movie"] },
              title: { type: "string" },
              root_folder: { type: "string" },
              tmdb_id: { type: "integer", nullable: true },
              tvdb_id: { type: "integer", nullable: true },
              imdb_id: { type: "string", nullable: true },
              year: { type: "integer", nullable: true },
              poster_url: { type: "string", nullable: true },
              overview: { type: "string", nullable: true },
              min_quality: { type: "string", enum: ["uhd", "fullhd", "hd", "sd"] },
              monitored: { type: "boolean", default: true },
              search_services_json: { type: "string", nullable: true },
              parent_subscription_id: { type: "integer", nullable: true },
              season_filter: { type: "integer", nullable: true },
              language: { type: "string", nullable: true },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Subscription created" },
      400: { description: "Validation error" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);

  if (!body?.type || !body?.title || !body?.root_folder) {
    setResponseStatus(event, 400);
    return { error: "Missing required fields: type, title, root_folder" };
  }
  if (body.type !== "series" && body.type !== "movie") {
    setResponseStatus(event, 400);
    return { error: "type must be 'series' or 'movie'" };
  }
  if (body.min_quality && !["uhd", "fullhd", "hd", "sd"].includes(body.min_quality)) {
    setResponseStatus(event, 400);
    return { error: "min_quality must be 'uhd', 'fullhd', 'hd' or 'sd'" };
  }

  const status = body.type === "series" ? "continuing" : "released";

  return createSubscription({
    type: body.type,
    title: body.title,
    status,
    root_folder: body.root_folder,
    min_quality: body.min_quality ?? "fullhd",
    monitored: body.monitored !== false,
    tmdb_id: body.tmdb_id ?? null,
    tvdb_id: body.tvdb_id ?? null,
    imdb_id: body.imdb_id ?? null,
    year: body.year ?? null,
    poster_url: body.poster_url ?? null,
    overview: body.overview ?? null,
    search_services_json: body.search_services_json ?? null,
    parent_subscription_id: body.parent_subscription_id ?? null,
    season_filter: body.season_filter ?? null,
    language: body.language ?? null,
  });
});
