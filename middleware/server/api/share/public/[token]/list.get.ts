import { loadShareByRef, requireShareTicket } from "../../../../utils/share-access";
import { isInsideAnyRoot, normalizeVirtualPath } from "../../../../utils/share-paths";
import { listVirtualDir } from "../../../../utils/share-fs";

defineRouteMeta({
  openAPI: {
    tags: ["Shares (public)"],
    summary: "List one level of a shared folder",
    parameters: [
      { name: "token", in: "path", required: true },
      { name: "path", in: "query", required: true, description: "Virtual path inside the share" },
      { name: "t", in: "query", required: true, description: "Ticket from /unlock" },
    ],
    responses: {
      200: { description: "Directory entries" },
      403: { description: "Outside the share or missing ticket" },
      404: { description: "Folder not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ref = decodeURIComponent(getRouterParam(event, "token") ?? "");
  const share = loadShareByRef(ref);
  requireShareTicket(event, share);

  const { path = "" } = getQuery(event);
  const normalized = normalizeVirtualPath(typeof path === "string" ? path : "");
  if (!normalized) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }
  if (!isInsideAnyRoot(share.roots, normalized)) {
    throw createError({ statusCode: 403, statusMessage: "Path outside the share" });
  }

  setHeader(event, "Cache-Control", "private, no-store");
  return listVirtualDir(normalized);
});
