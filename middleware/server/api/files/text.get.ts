import { existsSync, readFileSync, statSync } from "node:fs";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";

const MAX_SIZE = 1024 * 1024;

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Read text file",
    description: "Returns the UTF-8 contents of a text file (≤1 MB).",
    parameters: [{ name: "path", in: "query", required: true, description: "Relative file path" }],
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
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });

  const relPath = String(path);
  const realPath = resolveVirtualPath(relPath);
  if (!realPath) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  // Ensure mount if needed
  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) {
      try { await ensureSmbMounted(cfg); } catch (err: any) {
        throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
      }
    }
  }

  if (!existsSync(realPath)) throw createError({ statusCode: 404, statusMessage: "File not found" });

  const st = statSync(realPath);
  if (st.isDirectory()) throw createError({ statusCode: 400, statusMessage: "Path is a directory" });
  if (st.size > MAX_SIZE) throw createError({ statusCode: 400, statusMessage: "File too large (>1 MB)" });

  const content = readFileSync(realPath, "utf8");
  return { content };
});
