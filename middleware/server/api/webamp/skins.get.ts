import { readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const SKINS_DIR = join(process.cwd(), "data", "webamp", "skins");

export default defineEventHandler(() => {
  if (!existsSync(SKINS_DIR)) {
    return { skins: [] };
  }
  const files = readdirSync(SKINS_DIR);
  const skins = files
    .filter((f) => f.endsWith(".wsz"))
    .map((f) => {
      const stats = statSync(join(SKINS_DIR, f));
      return {
        name: f.replace(/\.wsz$/i, ""),
        file: f,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
  return { skins };
});
