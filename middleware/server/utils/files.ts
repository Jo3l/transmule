/**
 * File-manager utility helpers.
 *
 * getDownloadsRoot() — returns the configured downloads root directory.
 * resolveSafe()      — resolves a user-supplied relative path to an absolute
 *                      path that is guaranteed to stay within the root.
 */

import { resolve, join, sep } from "node:path";

export function getDownloadsRoot(): string {
  const dir = (process.env.NITRO_DOWNLOADS_DIR || "").trim();
  if (!dir) {
    throw createError({
      statusCode: 503,
      statusMessage:
        "Downloads directory not configured (set NITRO_DOWNLOADS_DIR)",
    });
  }
  return dir;
}

/**
 * Resolve a relative path safely inside root.
 * Throws 400 if the resolved path escapes the root (path-traversal guard).
 */
export function resolveSafe(root: string, relPath: string): string {
  const clean = decodeURIComponent(String(relPath || ""))
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const abs = resolve(join(root, clean));
  // Must equal root itself OR start with root + platform separator / "/"
  if (abs !== root && !abs.startsWith(root + sep) && !abs.startsWith(root + "/")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }
  return abs;
}
