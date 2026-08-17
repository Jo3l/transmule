/**
 * POST /api/planner/profiles/language
 *
 * Create a new language profile.
 */
import { createLanguageProfile } from "~/utils/planner-db";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Create language profile",
    description: "Creates a planner language profile.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
              must_have_json: { type: "string", nullable: true },
              must_not_have_json: { type: "string", nullable: true },
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
  if (!body?.name) {
    setResponseStatus(event, 400);
    return { error: "Missing required field: name" };
  }
  return createLanguageProfile({
    name: body.name,
    must_have_json: body.must_have_json ?? null,
    must_not_have_json: body.must_not_have_json ?? null,
    is_default: body.is_default === true,
  });
});
