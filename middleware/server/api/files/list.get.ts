import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "List directory",
    description: "List files and folders inside the downloads directory.",
    parameters: [
      {
        name: "path",
        in: "query",
        description: "Relative path inside downloads root ('' = root)",
      },
    ],
    responses: {
      200: { description: "Directory listing" },
      400: { description: "Invalid path" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path = "" } = getQuery(event);

  const root = getDownloadsRoot();
  const dir = resolveSafe(root, path as string);

  try {
    const names = readdirSync(dir);
    const items = names.map((name) => {
      const full = join(dir, name);
      try {
        const st = statSync(full);
        return {
          name,
          type: st.isDirectory() ? ("directory" as const) : ("file" as const),
          size: st.isDirectory() ? 0 : st.size,
          modified: st.mtime.toISOString(),
        };
      } catch {
        return {
          name,
          type: "file" as const,
          size: 0,
          modified: new Date(0).toISOString(),
        };
      }
    });

    // Directories first, then alphabetically by name
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { path: path as string, items };
  } catch (err: any) {
    if (err?.statusCode) throw err;
    throw createError({
      statusCode: 500,
      statusMessage: `Cannot list directory: ${err.message}`,
    });
  }
});
