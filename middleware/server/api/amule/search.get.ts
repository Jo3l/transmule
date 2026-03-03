defineRouteMeta({
  openAPI: {
    tags: ["Search"],
    summary: "Get search results",
    description:
      "Retrieve the current search results and search progress (0-1).",
    responses: {
      200: { description: "Search results and progress" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  try {
    const client = useAmuleClient();
    const [results, progress] = await Promise.all([
      client.searchResults(),
      client.searchStatus(),
    ]);

    const files = (results?.files || []).map((f) => ({
      hash: hashToHex(f.hash),
      name: f.fileName,
      sizeFull: f.sizeFull || 0,
      size_fmt: formatBytes(f.sizeFull),
      sources: f.sourceCount || 0,
      completeSources: f.completeSourceCount || 0,
      downloadStatus: f.downloadStatus || 0,
    }));

    return {
      results: {
        count: files.length,
        files,
      },
      progress, // 0 to 1 (1 = search complete)
    };
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});
