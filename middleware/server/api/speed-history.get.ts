defineRouteMeta({
  openAPI: {
    tags: ["Downloads"],
    summary: "Network speed history",
    description:
      "Returns up to 15 minutes of per-service download speed samples collected server-side.",
    responses: {
      200: { description: "Array of { t, amule, torrent, pyload } data points" },
    },
  },
});

import { getSpeedHistory } from "../utils/speedHistory";

export default defineEventHandler((event) => {
  requireUser(event);
  return getSpeedHistory();
});
