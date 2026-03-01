defineRouteMeta({
  openAPI: {
    tags: ["Preferences"],
    summary: "Apply aMule preferences",
    description:
      "Update aMule daemon configuration via EC protocol. " +
      "Body should contain partial preference sections: general, connection, servers, security.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            description:
              "Partial AmulePreferences — only provided sections are sent",
          },
        },
      },
    },
    responses: {
      200: { description: "Preferences saved" },
      400: { description: "Empty body" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body || Object.keys(body).length === 0) {
    setResponseStatus(event, 400);
    return {
      error: "Request body must contain at least one preference section",
    };
  }

  const client = useAmuleClient();
  await client.setPreferences(body);

  return { success: true };
});
