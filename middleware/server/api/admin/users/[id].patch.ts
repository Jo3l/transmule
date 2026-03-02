import bcrypt from "bcryptjs";

defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Change user password",
    description: "Change the password of any user account (admin only).",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer" },
        description: "User ID",
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["password"],
            properties: {
              password: { type: "string", minLength: 4 },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Password updated" },
      400: { description: "Validation error" },
      403: { description: "Admin access required" },
      404: { description: "User not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  if (!event.context.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  const id = Number(getRouterParam(event, "id"));
  const body = await readBody(event);

  if (!body?.password || body.password.length < 4) {
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be at least 4 characters",
    });
  }

  const user = getUserById(id);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const hash = bcrypt.hashSync(body.password, 10);
  updateUserPassword(id, hash);

  return { success: true };
});
