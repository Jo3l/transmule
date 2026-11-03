import { requireUser } from "../../utils/requireUser";
import { listShares, shareState } from "../../utils/share-db";

defineRouteMeta({
  openAPI: {
    tags: ["Shares"],
    summary: "List shares (active and recently expired/revoked)",
    responses: { 200: { description: "Shares without their tokens (tokens are stored hashed)" } },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  return listShares().map((share) => ({
    id: share.id,
    kind: share.kind,
    label: share.label,
    roots: share.roots,
    hasCode: share.hasCode,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    downloads: share.downloads,
    state: shareState(share),
  }));
});
