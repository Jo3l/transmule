import {
  startContainer,
  stopContainer,
  getContainerStatus,
  type ServiceName,
} from "~/utils/docker-client";

defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Start or stop a Docker service",
    description:
      "Start or stop the aMule or Transmission container (admin only).\n\n" +
      "Body: `{ service: 'amule' | 'transmission', action: 'start' | 'stop' }`",
    responses: {
      200: { description: "Action result with updated status" },
      400: { description: "Invalid service or action" },
      403: { description: "Admin access required" },
      500: { description: "Docker socket error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody(event);
  const service = body?.service as string;
  const action = body?.action as string;

  if (!service || !["amule", "transmission", "pyload"].includes(service)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Invalid service — must be 'amule', 'transmission' or 'pyload'",
    });
  }

  if (!action || !["start", "stop"].includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid action — must be 'start' or 'stop'",
    });
  }

  try {
    if (action === "start") {
      await startContainer(service as ServiceName);
    } else {
      await stopContainer(service as ServiceName);
    }

    // Return updated status
    const status = await getContainerStatus(service as ServiceName);
    return { ok: true, service, action, ...status };
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Docker error: ${err.message}`,
    });
  }
});
