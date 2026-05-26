import { createReadStream, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SKINS_DIR = join(process.cwd(), "data", "webamp", "skins");

export default defineEventHandler(async (event) => {
  let name = getRouterParam(event, "name") || "";
  // Remove .wsz extension if present in URL
  name = name.replace(/\.wsz$/i, "");

  if (!name || name.includes("..") || name.includes("/")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid skin name" });
  }

  if (!existsSync(SKINS_DIR)) {
    throw createError({ statusCode: 404, statusMessage: "No skins directory" });
  }

  // Find the skin file (case-insensitive match)
  const files = readdirSync(SKINS_DIR);
  const match = files.find(f =>
    f.toLowerCase() === `${name.toLowerCase()}.wsz` ||
    f.replace(/\.wsz$/i, "").toLowerCase() === name.toLowerCase()
  );
  if (!match) {
    throw createError({ statusCode: 404, statusMessage: `Skin "${name}" not found` });
  }

  const filePath = join(SKINS_DIR, match);
  const stats = statSync(filePath);
  const displayName = match.replace(/\.wsz$/i, "");

  setHeader(event, "Content-Type", "application/octet-stream");
  setHeader(event, "Content-Length", String(stats.size));
  setHeader(event, "Content-Disposition", `inline; filename="${displayName}.wsz"`);
  setHeader(event, "Cache-Control", "public, max-age=31536000, immutable");

  // HEAD request — same headers, no body
  if (getMethod(event) === "HEAD") {
    event.node.res.end();
    return;
  }

  return sendStream(event, createReadStream(filePath));
});
