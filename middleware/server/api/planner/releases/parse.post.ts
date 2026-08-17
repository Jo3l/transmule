/**
 * POST /api/planner/releases/parse
 *
 * Debug: parsea un nombre de release y devuelve la estructura.
 *
 * Body: { name: "Breaking.Bad.S01E02.1080p.WEB-DL.x264-GROUP" }
 */
import { parseReleaseName } from "~/services/planner/release-parser";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Parse release name (debug)",
    description: "Parses a torrent release name and returns its structured components.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Parsed release" },
      400: { description: "Missing name" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  if (!body?.name || typeof body.name !== "string") {
    setResponseStatus(event, 400);
    return { error: "Body field 'name' (string) is required" };
  }
  return parseReleaseName(body.name);
});
