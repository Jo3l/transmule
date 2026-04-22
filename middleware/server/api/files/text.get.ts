import { existsSync, readFileSync, statSync } from "node:fs";

const MAX_SIZE = 1024 * 1024; // 1 MB safety cap

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Read text file",
    description:
      "Returns the UTF-8 contents of a text file (≤1 MB) from the downloads directory.",
    parameters: [
      {
        name: "path",
        in: "query",
        required: true,
        description: "Relative file path",
      },
    ],
    responses: {
      200: { description: "{ content: string }" },
      400: { description: "Missing path, directory, or file too large" },
      404: { description: "File not found" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);

  const { path = "" } = getQuery(event);
  if (!path)
    throw createError({ statusCode: 400, statusMessage: "path is required" });

  const root = getDownloadsRoot();
  const filePath = resolveSafe(root, path as string);

  if (!existsSync(filePath))
    throw createError({ statusCode: 404, statusMessage: "File not found" });

  const stat = statSync(filePath);
  if (stat.isDirectory())
    throw createError({
      statusCode: 400,
      statusMessage: "Path is a directory",
    });
  if (stat.size > MAX_SIZE)
    throw createError({
      statusCode: 400,
      statusMessage: "File too large to edit (>1 MB)",
    });

  const content = readFileSync(filePath, "utf8");
  return { content };
});
