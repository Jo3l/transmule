import { getCensus } from "../../utils/slskd-presence";

defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Count TransMule instances online",
    description:
      "Reads the members of the Transmule channel and counts those whose Soulseek description carries the TransMule marker. Requires this instance to be joined to the channel; the result is cached for an hour, pass ?refresh=1 to force a recount.",
    responses: {
      200: { description: "Census" },
      403: { description: "Authentication required" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const force = query?.refresh === "1" || query?.refresh === "true";
  const client = useSlskdClient();

  try {
    return await getCensus(client, force);
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `slskd error: ${err.message}` });
  }
});
