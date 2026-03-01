defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad server control",
    description:
      "Control the pyLoad download server.\n\n" +
      "Actions:\n" +
      "- `pause`            — Pause all downloads\n" +
      "- `unpause`          — Unpause / resume downloads\n" +
      "- `toggle_pause`     — Toggle pause state\n" +
      "- `stop_all`         — Abort all running downloads\n" +
      "- `restart_failed`   — Re-queue all failed downloads\n" +
      "- `delete_finished`  — Delete finished packages and links",
    responses: {
      200: { description: "Action result" },
      400: { description: "Invalid action" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const action = body?.action;
  const client = usePyLoadClient();

  switch (action) {
    case "pause":
      await client.pause();
      break;
    case "unpause":
      await client.unpause();
      break;
    case "toggle_pause":
      await client.togglePause();
      break;
    case "stop_all":
      await client.stopAllDownloads();
      break;
    case "restart_failed":
      await client.restartFailed();
      break;
    case "delete_finished":
      await client.deleteFinished();
      break;
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown action: ${action}. Valid: pause, unpause, toggle_pause, stop_all, restart_failed, delete_finished`,
      });
  }

  // Return fresh status after the action
  const status = await client.getStatus();
  return {
    ok: true,
    action,
    paused: status.pause,
    active: status.active,
    queue: status.queue,
    speed: status.speed,
  };
});
