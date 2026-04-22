import { existsSync, writeFileSync, statSync } from "node:fs";

const MAX_SIZE = 1024 * 1024; // 1 MB safety cap

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Write text file",
    description:
      "Overwrites a text file in the downloads directory with UTF-8 content.",
    responses: {
      200: { description: "{ ok: true }" },
      400: { description: "Validation error" },
      404: { description: "File not found" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody<{ path: string; content: string }>(event);
  const { path = "", content = "" } = body ?? {};

  if (!path)
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  if (typeof content !== "string")
    throw createError({
      statusCode: 400,
      statusMessage: "content must be a string",
    });

  const root = getDownloadsRoot();
  const filePath = resolveSafe(root, path);

  if (!existsSync(filePath))
    throw createError({ statusCode: 404, statusMessage: "File not found" });

  const stat = statSync(filePath);
  if (stat.isDirectory())
    throw createError({
      statusCode: 400,
      statusMessage: "Path is a directory",
    });

  const byteLen = Buffer.byteLength(content, "utf8");
  if (byteLen > MAX_SIZE)
    throw createError({
      statusCode: 400,
      statusMessage: "Content too large (>1 MB)",
    });

  writeFileSync(filePath, content, "utf8");
  return { ok: true };
});
