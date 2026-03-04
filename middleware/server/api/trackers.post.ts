import { setConfig } from "../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Torrent Search"],
    summary: "Save custom BitTorrent tracker list",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              trackers: {
                type: "string",
                description: "Newline-separated tracker URLs",
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Saved" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody<{ trackers?: string }>(event);
  setConfig("bt_trackers", body?.trackers ?? "");
  return { ok: true };
});
