defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "Manage pyLoad packages",
    description:
      "Perform actions on pyLoad packages and links.\n\n" +
      "Actions:\n" +
      "- `add`           — Add a new package with one or more links\n" +
      "- `delete`        — Delete packages by PID array\n" +
      "- `restart`       — Re-queue a failed/finished package by PID\n" +
      "- `move_to_queue` — Move a collector package to the download queue",
    responses: {
      200: { description: "Action result" },
      400: { description: "Invalid action or missing parameters" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const action = body?.action;
  const client = usePyLoadClient();

  switch (action) {
    case "add": {
      const { name, links } = body;
      if (!name || !links?.length) {
        throw createError({
          statusCode: 400,
          statusMessage: "name and links[] are required for action=add",
        });
      }
      // dest=1 sends directly to queue, dest=0 goes to collector
      const dest = body.dest === 0 ? 0 : 1;
      const pid = await client.addPackage(name, links, dest);
      return { ok: true, action, pid };
    }

    case "delete": {
      const pids: number[] = body.pids;
      if (!Array.isArray(pids) || !pids.length) {
        throw createError({
          statusCode: 400,
          statusMessage: "pids[] is required for action=delete",
        });
      }
      await client.deletePackages(pids);
      return { ok: true, action, pids };
    }

    case "restart": {
      const { pid } = body;
      if (!pid) {
        throw createError({
          statusCode: 400,
          statusMessage: "pid is required for action=restart",
        });
      }
      await client.restartPackage(Number(pid));
      return { ok: true, action, pid };
    }

    case "move_to_queue": {
      const { pid } = body;
      if (!pid) {
        throw createError({
          statusCode: 400,
          statusMessage: "pid is required for action=move_to_queue",
        });
      }
      await client.moveToQueue(Number(pid));
      return { ok: true, action, pid };
    }

    case "stop": {
      const { pid } = body;
      if (!pid) {
        throw createError({
          statusCode: 400,
          statusMessage: "pid is required for action=stop",
        });
      }
      // Get the actively downloading fids for this package and stop them
      const active = await client.getActiveDownloads();
      const fids = active
        .filter((d) => d.package_id === Number(pid))
        .map((d) => d.fid);
      if (fids.length > 0) {
        await client.stopDownloads(fids);
      }
      return { ok: true, action, pid, stoppedFids: fids };
    }

    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown action: ${action}. Valid: add, delete, restart, move_to_queue`,
      });
  }
});
