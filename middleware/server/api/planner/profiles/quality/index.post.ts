/**
 * POST /api/planner/profiles/quality
 *
 * Create a new quality profile.
 */
import { createQualityProfile } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Create quality profile",
    description: "Creates a planner quality profile.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name", "qualities_json", "cutoff"],
            properties: {
              name: { type: "string" },
              qualities_json: { type: "string" },
              cutoff: { type: "string" },
              upgrade_until: { type: "string", nullable: true },
              min_size_mb: { type: "integer", nullable: true },
              max_size_mb: { type: "integer", nullable: true },
              is_default: { type: "boolean" },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Profile created" },
      400: { description: "Validation error" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  if (!body?.name || !body?.qualities_json || !body?.cutoff) {
    setResponseStatus(event, 400);
    return { error: "Missing required fields: name, qualities_json, cutoff" };
  }
  return createQualityProfile({
    name: body.name,
    qualities_json: body.qualities_json,
    cutoff: body.cutoff,
    upgrade_until: body.upgrade_until ?? null,
    min_size_mb: body.min_size_mb ?? null,
    max_size_mb: body.max_size_mb ?? null,
    is_default: body.is_default === true,
  });
});
