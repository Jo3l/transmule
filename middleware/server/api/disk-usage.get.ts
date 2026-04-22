/**
 * GET /api/disk-usage
 *
 * Returns disk usage statistics for the downloads directory (or / as fallback).
 * Because the downloads folder is a bind-mount from the host, statfs reports
 * host filesystem stats — giving real host disk space visibility from inside Docker.
 */
import { statfsSync } from "node:fs";

defineRouteMeta({
  openAPI: {
    tags: ["System"],
    summary: "Get disk usage for the downloads directory",
    responses: {
      200: { description: "Disk usage stats" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);

  let path: string;
  try {
    path = getDownloadsRoot();
  } catch {
    path = "/";
  }

  try {
    const s = statfsSync(path);
    const total = s.blocks * s.bsize;
    const avail = s.bavail * s.bsize;
    const used = total - avail;
    const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;

    return { total, used, avail, usedPercent, path };
  } catch {
    // Fallback to root if path is inaccessible
    const s = statfsSync("/");
    const total = s.blocks * s.bsize;
    const avail = s.bavail * s.bsize;
    const used = total - avail;
    const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;

    return { total, used, avail, usedPercent, path: "/" };
  }
});
