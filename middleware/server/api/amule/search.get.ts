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

import { _searchFilters } from "./search.post";

export default defineEventHandler(async (event) => {
  const { userId } = requireUser(event);

  try {
    const client = useAmuleClient();
    const [results, progress] = await Promise.all([
      client.searchResults(),
      client.searchStatus(),
    ]);

    let files = (results?.files || []).map((f) => ({
      hash: hashToHex(f.hash),
      name: f.fileName,
      sizeFull: f.sizeFull || 0,
      size_fmt: formatBytes(f.sizeFull),
      sources: f.sourceCount || 0,
      completeSources: f.completeSourceCount || 0,
      downloadStatus: f.downloadStatus || 0,
    }));

    // Apply server-side search filters (library's EC protocol can't pass them)
    const sf = _searchFilters.get(userId);
    if (sf) {
      if (sf.availability) files = files.filter((f) => f.sources >= sf.availability!);
      if (sf.minSize) files = files.filter((f) => f.sizeFull >= sf.minSize!);
      if (sf.maxSize) files = files.filter((f) => f.sizeFull <= sf.maxSize!);
    }

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
