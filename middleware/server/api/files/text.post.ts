import { existsSync, writeFileSync, statSync } from "node:fs";

const MAX_SIZE = 1024 * 1024; // 1 MB safety cap

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Write text file",
    description:
      "Overwrites a text file in the downloads directory or a remote mount with UTF-8 content.",
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

  const byteLen = Buffer.byteLength(content, "utf8");
  if (byteLen > MAX_SIZE)
    throw createError({
      statusCode: 400,
      statusMessage: "Content too large (>1 MB)",
    });

  // Check if inside a remote mount
  const mountInfo = resolveMountPath(path);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const client = createSmbClient(mount);

    try {
      const remoteFilePath = buildRemotePath(mount, subPath);

      const st = await withTimeout(client.stat(remoteFilePath), 8000).catch(() => null);
      if (!st) {
        throw createError({ statusCode: 404, statusMessage: "File not found" });
      }
      if (st.isDirectory()) {
        throw createError({ statusCode: 400, statusMessage: "Path is a directory" });
      }

      await withTimeout(client.writeFile(remoteFilePath, content, { encoding: "utf8" }), 8000);
      return { ok: true };
    } catch (err: any) {
      if (err?.statusCode) throw err;
      throw createError({
        statusCode: 500,
        statusMessage: `Cannot write remote file: ${err.message}`,
      });
    } finally {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

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

  writeFileSync(filePath, content, "utf8");
  return { ok: true };
});
