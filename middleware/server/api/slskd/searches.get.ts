import type { SlskdSearch } from "~/utils/slskd-client";

defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "List Soulseek searches",
    description: "Returns all current Soulseek searches.",
    responses: {
      200: { description: "Search list" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const searches = await client.getSearches();
    return searches;
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd searches error: ${err.message}`,
    });
  }
});
