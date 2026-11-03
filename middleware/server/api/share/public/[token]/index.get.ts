import { loadShareByRef } from "../../../../utils/share-access";

defineRouteMeta({
  openAPI: {
    tags: ["Shares (public)"],
    summary: "Share metadata (never lists file names)",
    parameters: [{ name: "token", in: "path", required: true }],
    responses: {
      200: { description: "Label, kind and whether a code is required" },
      404: { description: "Unknown share" },
      410: { description: "Expired or revoked" },
    },
  },
});

export default defineEventHandler((event) => {
  const ref = decodeURIComponent(getRouterParam(event, "token") ?? "");
  const share = loadShareByRef(ref);
  setHeader(event, "Cache-Control", "private, no-store");
  return {
    id: share.id,
    label: share.label,
    kind: share.kind,
    needsCode: share.hasCode,
    itemCount: share.roots.length,
    expiresAt: share.expiresAt,
  };
});
