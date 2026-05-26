import { existsSync, unlinkSync } from "fs";
import { join } from "path";

const SKINS_DIR = join(process.cwd(), "data", "webamp", "skins");

export default defineEventHandler(async (event) => {
  const { userId } = requireUser(event);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const name = getRouterParam(event, "name");
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "Skin name required" });
  }

  // Security: prevent path traversal
  if (name.includes("..") || name.includes("/")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid skin name" });
  }

  const filename = name.endsWith(".wsz") ? name : `${name}.wsz`;
  const filePath = join(SKINS_DIR, filename);

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, statusMessage: "Skin not found" });
  }

  unlinkSync(filePath);
  return { ok: true };
});
