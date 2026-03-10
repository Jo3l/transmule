/**
 * File-manager utility helpers.
 *
 * getDownloadsRoot() — returns the configured downloads root directory.
 * resolveSafe()      — resolves a user-supplied relative path to an absolute
 *                      path that is guaranteed to stay within the root.
 * initJobStore()     — ensures the shared in-process transfer/extract/compress
 *                      job map is initialised exactly once.
 */

import { resolve, join, sep } from "node:path";

// ── Shared background-job store ────────────────────────────────────────────
// All file-operation endpoints (transfer, extract, compress) write to this
// single Map so the generic /api/files/transfer-status endpoint can poll any
// job regardless of its type.
declare global {
  // eslint-disable-next-line no-var
  var __transferJobs: Map<
    string,
    {
      id: string;
      /** Human-readable display name (e.g. basename of first source). */
      name: string;
      mode: "move" | "copy" | "extract" | "compress";
      sources: string[];
      destination: string;
      total: number;
      done: number;
      /** Total bytes to transfer (optional — set for move/copy, not extract/compress). */
      bytesTotal?: number;
      /** Bytes transferred so far. */
      bytesDone?: number;
      status: "queued" | "running" | "done" | "error";
      error?: string;
      /** ISO timestamp when the job was enqueued. */
      queuedAt: string;
      /** ISO timestamp when execution actually started (not set while queued). */
      startedAt?: string;
      finishedAt?: string;
    }
  >;
  // eslint-disable-next-line no-var
  /** Ordered list of transfer jobIds waiting to run. */
  var __transferQueue: string[];
  // eslint-disable-next-line no-var
  /** AbortController per running transfer job, keyed by jobId. */
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

// Initialise eagerly when this utils module is first loaded
initJobStore();

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
  if (
    abs !== root &&
    !abs.startsWith(root + sep) &&
    !abs.startsWith(root + "/")
  ) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }
  return abs;
}
