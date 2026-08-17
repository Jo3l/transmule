/**
 * GET /api/planner/metadata/tvdb/series/:id
 *
 * Detalle de serie TVDB.
 */
import { getTvdbSeriesDetail } from "~/services/planner/tvdb";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "TVDB series detail",
    description: "Returns TVDB series detail.",
    responses: {
      200: { description: "Series detail" },
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
  const detail = await getTvdbSeriesDetail(id);
  if (!detail) {
    setResponseStatus(event, 404);
    return { error: "Series not found" };
  }
  return detail;
});
