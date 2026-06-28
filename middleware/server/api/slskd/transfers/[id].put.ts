defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Cancel or retry a Soulseek transfer",
    description:
      "Performs an action (cancel or retry) on a transfer by ID.",
    responses: {
      200: { description: "Action performed" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing transfer id" });
  }

  const body = await readBody(event);
  const action = typeof body === "string" ? body.trim() : "";

  if (!action || !["cancel", "retry"].includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Action must be 'cancel' or 'retry'",
    });
  }

  try {
    let ok = false;
    if (action === "cancel") {
      ok = await client.cancelTransfer(Number(id));
    } else {
      // Retry: cancel without removing, then let the front-end re-request
      ok = await client.cancelTransfer(Number(id), false);
    }
    return { success: ok };
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `slskd transfer action error: ${err.message}`,
    });
  }
});
