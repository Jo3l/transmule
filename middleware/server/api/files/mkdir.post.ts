import { mkdirSync, existsSync } from "node:fs";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create folder",
    description: "Create a new folder inside the downloads directory or a remote mount.",
    responses: {
      200: { description: "Folder created" },
      400: { description: "Missing path" },
      409: { description: "Already exists" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { path } = body || {};

  if (!path) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }

  // Check if we are inside a remote mount
  const mountInfo = resolveMountPath(path);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const client = createSmbClient(mount);

    try {
      const remoteDir = buildRemotePath(mount, subPath);

      await withTimeout(client.mkdir(remoteDir), 8000);
      return { ok: true };
    } catch (err: any) {
      throw createError({
        statusCode: 500,
        statusMessage: `Cannot create remote directory: ${err.message}`,
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
  const dir = resolveSafe(root, path);

  if (existsSync(dir)) {
    throw createError({ statusCode: 409, statusMessage: "Already exists" });
  }

  try {
    mkdirSync(dir, { recursive: true });
    return { ok: true };
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message });
  }
});
