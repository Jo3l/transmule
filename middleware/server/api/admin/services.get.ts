defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Get Docker services status",
    description:
      "Returns the running status of the aMule and Transmission containers (admin only).",
    responses: {
      200: { description: "Services status" },
      403: { description: "Admin access required" },
      500: { description: "Docker socket error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  try {
    const services = await getAllServicesStatus();
    return { services };
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Docker error: ${err.message}`,
    });
  }
});
