import { existsSync, readFileSync, statSync } from "node:fs";
import { resolveVirtualPath, smbDownloadStream } from "../../utils/remoteMounts";

const MAX_SIZE = 1024 * 1024;

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Read text file",
    parameters: [{ name: "path", in: "query", required: true }],
    responses: { 200: {}, 400: {}, 404: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { path = "" } = getQuery(event);
  if (!path) throw createError({ statusCode: 400, statusMessage: "path is required" });

  const resolved = resolveVirtualPath(String(path));
  if (!resolved) throw createError({ statusCode: 400, statusMessage: "Invalid path" });

  if (resolved.type === "smb") {
    const { stream } = smbDownloadStream(resolved.config, resolved.subPath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const content = Buffer.concat(chunks).toString("utf8");
    if (Buffer.byteLength(content) > MAX_SIZE)
      throw createError({ statusCode: 400, statusMessage: "File too large (>1 MB)" });
    return { content };
  }

  if (!existsSync(resolved.absPath)) throw createError({ statusCode: 404, statusMessage: "File not found" });
  const st = statSync(resolved.absPath);
  if (st.isDirectory()) throw createError({ statusCode: 400, statusMessage: "Path is a directory" });
  if (st.size > MAX_SIZE) throw createError({ statusCode: 400, statusMessage: "File too large (>1 MB)" });
  return { content: readFileSync(resolved.absPath, "utf8") };
});
