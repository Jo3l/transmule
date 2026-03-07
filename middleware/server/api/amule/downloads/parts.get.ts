/**
 * GET /api/amule/downloads/parts[?hash=<hexHash>]
 *
 * Returns per-chunk progress data for all queued downloads (or a single file
 * when `hash` is supplied). The frontend uses this to paint the chunk progress
 * bar instead of a simple percentage-based SProgress bar.
 *
 * Response: { parts: Record<hexHash, ChunkInfo> }
 */

defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Get per-chunk download progress",
    parameters: [
      {
        name: "hash",
        in: "query",
        required: false,
        description: "Hex hash of a specific file — omit to get all files",
      },
    ],
    responses: {
      200: { description: "Chunk map indexed by hex hash" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { hash } = getQuery(event);

  try {
    const client = useAmuleClient();
    const parts = await client.getFileChunks(hash ? String(hash) : undefined);
    return { parts };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
