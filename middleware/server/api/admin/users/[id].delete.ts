defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Delete user",
    description:
      "Delete a user account by ID (admin only). Cannot delete yourself.",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer" },
        description: "User ID",
      },
    ],
    responses: {
      200: { description: "User deleted" },
      400: { description: "Cannot delete yourself" },
      403: { description: "Admin access required" },
      404: { description: "User not found" },
    },
  },
});

export default defineEventHandler((event) => {
  const currentUser = requireAdmin(event);

  const id = Number(getRouterParam(event, "id"));

  if (id === currentUser.userId) {
    setResponseStatus(event, 400);
    return { error: "Cannot delete your own account" };
  }

  const success = deleteUser(id);
  if (!success) {
    setResponseStatus(event, 404);
    return { error: "User not found" };
  }

  return { success: true };
});
