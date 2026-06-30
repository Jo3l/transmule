/**
 * File-manager utility helpers.
 *
 * getDownloadsRoot() — returns the configured downloads root directory.
 * resolveSafe()      — resolves a user-supplied relative path to an absolute
 *                      filesystem path, with path-traversal guard.
 * initJobStore()     — ensures the shared in-process transfer/extract/compress
 *                      job map is initialised exactly once.
 */

import { resolve, join, sep } from "node:path";

// ── Shared background-job store ────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __transferJobs: Map<
    string,
    {
      id: string;
      name: string;
      mode: "move" | "copy" | "extract" | "compress";
      sources: string[];
      destination: string;
      total: number;
      done: number;
      bytesTotal?: number;
      bytesDone?: number;
      status: "queued" | "running" | "done" | "error";
      error?: string;
      queuedAt: string;
      startedAt?: string;
      finishedAt?: string;
    }
  >;
  // eslint-disable-next-line no-var
  var __transferQueue: string[];
  // eslint-disable-next-line no-var
  var __transferAbortControllers: Map<string, AbortController>;
}

export function initJobStore() {
  if (!globalThis.__transferJobs) {
    globalThis.__transferJobs = new Map();
  }
  if (!globalThis.__transferQueue) {
    globalThis.__transferQueue = [];
  }
  if (!globalThis.__transferAbortControllers) {
    globalThis.__transferAbortControllers = new Map();
  }
}

initJobStore();

/** Returns the configured downloads root directory (throws 503 if not set). */
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
  if (
    abs !== root &&
    !abs.startsWith(root + sep) &&
    !abs.startsWith(root + "/")
  ) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }
  return abs;
}
