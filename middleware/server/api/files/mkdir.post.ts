import { mkdirSync, existsSync } from "node:fs";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create folder",
    description: "Create a new folder inside the downloads directory.",
    responses: {
      200: { description: "Folder created" },
      400: { description: "Missing path" },
      409: { description: "Already exists" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { path } = body || {};

  if (!path) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
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
