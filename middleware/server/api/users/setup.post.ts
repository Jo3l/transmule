import bcrypt from "bcryptjs";

defineRouteMeta({
  openAPI: {
    tags: ["Users"],
    summary: "Initial setup",
    description:
      "Create the first admin user. Only works when zero users exist in the database.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["username", "password"],
            properties: {
              username: {
                type: "string",
                minLength: 3,
                description: "Admin username",
              },
              password: {
                type: "string",
                minLength: 4,
                description: "Admin password",
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: "Admin user created + JWT" },
      400: { description: "Missing fields or users already exist" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body?.username || !body?.password) {
    setResponseStatus(event, 400);
    return { error: "Missing required fields: username, password" };
  }

  if (getUserCount() > 0) {
    setResponseStatus(event, 400);
    return { error: "Setup already completed. Users exist." };
  }

  const hash = bcrypt.hashSync(body.password, 10);
  const user = createUser(body.username, hash, true);

  const token = signToken({
    userId: user.id,
    username: user.username,
    isAdmin: true,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      isAdmin: true,
    },
  };
});
