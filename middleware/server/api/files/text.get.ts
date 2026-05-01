import { existsSync, readFileSync, statSync } from "node:fs";

const MAX_SIZE = 1024 * 1024; // 1 MB safety cap

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Read text file",
    description:
      "Returns the UTF-8 contents of a text file (≤1 MB) from the downloads directory or a remote mount.",
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

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path = "" } = getQuery(event);
  if (!path)
    throw createError({ statusCode: 400, statusMessage: "path is required" });

  const relPath = String(path);

  // Check if inside a remote mount
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const client = createSmbClient(mount);

    try {
      const remoteFilePath = buildRemotePath(mount, subPath);

      const st = await withTimeout(client.stat(remoteFilePath), 8000);
      if (st.isDirectory()) {
        throw createError({ statusCode: 400, statusMessage: "Path is a directory" });
      }

      // SMB2 stat doesn't expose size in the type definition, so we read and cap after
      const content = await withTimeout(
        client.readFile(remoteFilePath, { encoding: "utf8" }),
        8000,
      );
      if (Buffer.byteLength(content, "utf8") > MAX_SIZE) {
        throw createError({ statusCode: 400, statusMessage: "File too large to edit (>1 MB)" });
      }
      return { content };
    } catch (err: any) {
      if (err?.statusCode) throw err;
      throw createError({
        statusCode: 500,
        statusMessage: `Cannot read remote file: ${err.message}`,
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
  const filePath = resolveSafe(root, relPath);

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
