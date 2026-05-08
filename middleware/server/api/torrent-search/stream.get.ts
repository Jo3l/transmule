/**
 * SSE endpoint for streaming torrent search results.
 */
import { searchTorrentsStreamed } from "../../torrent-search/stream";
import {
  ensureProviders,
  getTorrentSearchProviders,
} from "../../providers/loader";

defineRouteMeta({
  openAPI: {
    tags: ["Torrent Search"],
    summary: "Stream torrent search results (SSE)",
    description:
      "Returns results progressively via Server-Sent Events as each " +
      "plugin completes. Each event contains results from one source.",
    responses: {
      200: { description: "SSE event stream" },
      400: { description: "Missing or invalid query" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { q, source = "all", limit = "75" } = getQuery(event);

  if (!q || typeof q !== "string" || !q.trim()) {
    throw createError({ statusCode: 400, statusMessage: "q is required" });
  }

  await ensureProviders();
  const plugins = getTorrentSearchProviders();
  const validIds = plugins.map((p) => p.meta.id);

  const src =
    source === "all" ||
    (typeof source === "string" && validIds.includes(source))
      ? (source as string)
      : "all";

  const limitN = Math.min(Math.max(Number(limit) || 75, 1), 200);

  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "X-Accel-Buffering", "no");

  const res = event.node.res;
  let totalResults = 0;
  let sourceCount = 0;

  await searchTorrentsStreamed(
    { query: q.trim(), source: src, limit: limitN, extraTrackers: "" },
    (sourceId, results) => {
      totalResults += results.length;
      sourceCount++;
      const payload = JSON.stringify({ source: sourceId, results });
      res.write(`event: result\ndata: ${payload}\n\n`);
    },
  );

  const completePayload = JSON.stringify({
    total: totalResults,
    sources: sourceCount,
    query: q.trim(),
    source: src,
  });
  res.write(`event: complete\ndata: ${completePayload}\n\n`);
  res.end();
});
