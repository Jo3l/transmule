import bcrypt from "bcryptjs";

defineRouteMeta({
  openAPI: {
    tags: ["Users"],
    summary: "Change own password",
    description: "Change the authenticated user's own password.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["currentPassword", "newPassword"],
            properties: {
              currentPassword: { type: "string" },
              newPassword: { type: "string", minLength: 4 },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Password changed" },
      400: { description: "Validation error or wrong current password" },
      401: { description: "Not authenticated" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { userId } = event.context.user;

  const body = await readBody(event);

  if (!body?.currentPassword || !body?.newPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: currentPassword, newPassword",
    });
  }

  if (body.newPassword.length < 4) {
    throw createError({
      statusCode: 400,
      statusMessage: "New password must be at least 4 characters",
    });
  }

  const user = getUserById(userId);
  if (!user || !bcrypt.compareSync(body.currentPassword, user.password_hash)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Current password is incorrect",
    });
  }

  const hash = bcrypt.hashSync(body.newPassword, 10);
  updateUserPassword(userId, hash);

  return { success: true };
});
