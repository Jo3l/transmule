import bcrypt from "bcryptjs";

defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Create user",
    description: "Create a new user account (admin only).",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["username", "password"],
            properties: {
              username: { type: "string", minLength: 3 },
              password: { type: "string", minLength: 4 },
              isAdmin: { type: "boolean", default: false },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "User created" },
      400: { description: "Validation error" },
      403: { description: "Admin access required" },
      409: { description: "Username already exists" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody(event);

  if (!body?.username || !body?.password) {
    setResponseStatus(event, 400);
    return { error: "Missing required fields: username, password" };
  }

  if (body.username.length < 3) {
    setResponseStatus(event, 400);
    return { error: "Username must be at least 3 characters" };
  }

  if (body.password.length < 4) {
    setResponseStatus(event, 400);
    return { error: "Password must be at least 4 characters" };
  }

  const existing = getUserByUsername(body.username);
  if (existing) {
    setResponseStatus(event, 409);
    return { error: "Username already exists" };
  }

  const hash = bcrypt.hashSync(body.password, 10);
  const user = createUser(body.username, hash, body.isAdmin === true);

  return {
    user: {
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin === 1,
      createdAt: user.created_at,
    },
  };
});
