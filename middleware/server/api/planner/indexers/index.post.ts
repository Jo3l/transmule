/**
 * POST /api/planner/indexers
 *
 * Create a new indexer (Newznab/Torznab/RSS).
 */
import { createIndexer } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Create indexer",
    description: "Adds a new indexer to the planner.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name", "kind", "base_url"],
            properties: {
              name: { type: "string" },
              kind: { type: "string", enum: ["newznab", "torznab", "rss"] },
              base_url: { type: "string" },
              api_key: { type: "string", nullable: true },
              enabled: { type: "boolean" },
              priority: { type: "integer" },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Indexer created" },
      400: { description: "Validation error" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  if (!body?.name || !body?.kind || !body?.base_url) {
    setResponseStatus(event, 400);
    return { error: "Missing required fields: name, kind, base_url" };
  }
  if (!["newznab", "torznab", "rss"].includes(body.kind)) {
    setResponseStatus(event, 400);
    return { error: "Invalid kind. Must be 'newznab', 'torznab' or 'rss'." };
  }
  return createIndexer({
    name: body.name,
    kind: body.kind,
    base_url: body.base_url,
    api_key: body.api_key ?? null,
    enabled: body.enabled !== false,
    priority: typeof body.priority === "number" ? body.priority : 25,
  });
});
