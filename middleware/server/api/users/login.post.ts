import bcrypt from "bcryptjs";

defineRouteMeta({
  openAPI: {
    tags: ["Users"],
    summary: "User login",
    description: "Authenticate with username/password and receive a JWT.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["username", "password"],
            properties: {
              username: { type: "string" },
              password: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Login successful — JWT returned" },
      401: { description: "Invalid credentials" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body?.username || !body?.password) {
    setResponseStatus(event, 400);
    return { error: "Missing required fields: username, password" };
  }

  const user = getUserByUsername(body.username);
  if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
    setResponseStatus(event, 401);
    return { error: "Invalid username or password" };
  }

  const token = signToken({
    userId: user.id,
    username: user.username,
    isAdmin: user.is_admin === 1,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin === 1,
    },
  };
});
