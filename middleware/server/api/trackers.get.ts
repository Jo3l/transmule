import { getConfig } from "../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Torrent Search"],
    summary: "Get custom BitTorrent tracker list",
    responses: {
      200: { description: "Tracker list (newline-separated)" },
    },
  },
});

export default defineEventHandler(() => {
  const trackers = getConfig("bt_trackers") ?? "";
  return { trackers };
});
