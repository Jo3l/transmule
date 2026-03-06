defineRouteMeta({
  openAPI: {
    tags: ["Torrents"],
    summary: "Torrent actions",
    description:
      "Perform actions on Transmission torrents.\n\n" +
      "Actions: `add`, `start`, `stop`, `remove`, `remove_data`, `verify`, `reannounce`, `set`",
    responses: {
      200: { description: "Action result" },
      400: { description: "Invalid action or missing parameters" },
      502: { description: "Transmission connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const action = body?.action;
  try {
    const client = useTransmissionClient();

    switch (action) {
    case "add": {
      // Add torrent by magnet/URL or base64-encoded metainfo
      const filename = body.filename || body.url || body.magnet;
      const metainfo = body.metainfo;
      if (!filename && !metainfo) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "Either filename (magnet/URL) or metainfo (base64) is required",
        });
      }
      const result = await client.addTorrent({
        filename,
        metainfo,
        downloadDir: body.download_dir,
        paused: body.paused,
        labels: body.labels,
      });
      return { ok: true, action: "add", torrent: result };
    }

    case "start": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      await client.startTorrents(ids);
      return { ok: true, action: "start", ids };
    }

    case "stop": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      await client.stopTorrents(ids);
      return { ok: true, action: "stop", ids };
    }

    case "remove": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      await client.removeTorrents(ids, false);
      return { ok: true, action: "remove", ids };
    }

    case "remove_data": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      await client.removeTorrents(ids, true);
      return { ok: true, action: "remove_data", ids };
    }

    case "verify": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      await client.verifyTorrents(ids);
      return { ok: true, action: "verify", ids };
    }

    case "reannounce": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      await client.reannounceTorrents(ids);
      return { ok: true, action: "reannounce", ids };
    }

    case "set": {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        throw createError({ statusCode: 400, statusMessage: "ids required" });
      }
      const settings = body.settings || {};
      await client.setTorrent(ids, settings);
      return { ok: true, action: "set", ids };
    }

    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown action: ${action}. Valid: add, start, stop, remove, remove_data, verify, reannounce, set`,
      });
  }
  } catch (err: any) {
    if ((err as any).statusCode && (err as any).statusCode < 500) throw err;
    throw createError({
      statusCode: 503,
      statusMessage: `Transmission unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
    });
  }
});

function normalizeIds(ids: any): (number | string)[] {
  if (!ids) return [];
  if (Array.isArray(ids)) return ids;
  return [ids];
}
