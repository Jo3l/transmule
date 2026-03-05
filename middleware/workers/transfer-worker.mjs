/**
 * transfer-worker.mjs
 *
 * Standalone Node.js child process that performs a move or copy operation
 * item by item, reporting progress back to the parent via IPC messages.
 *
 * Runs as a detached process so the HTTP response can close immediately.
 * The parent Nitro process receives progress/done/error messages and updates
 * the in-memory job map.
 *
 * Environment variables (set by transfer.post.ts):
 *   TRANSFER_JOB_ID   – UUID of the job
 *   TRANSFER_SOURCES  – JSON array of absolute source paths
 *   TRANSFER_DEST     – Absolute destination directory
 *   TRANSFER_MODE     – "move" | "copy"
 */

import { cpSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const jobId = process.env.TRANSFER_JOB_ID;
const sources = JSON.parse(process.env.TRANSFER_SOURCES || "[]");
const dest = process.env.TRANSFER_DEST || "";
const mode = process.env.TRANSFER_MODE || "copy";

function send(msg) {
  if (process.send) process.send(msg);
}

async function run() {
  if (!jobId || !sources.length || !dest) {
    send({ type: "error", jobId, error: "Missing parameters" });
    process.exit(1);
  }

  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  let done = 0;

  for (const src of sources) {
    try {
      if (!existsSync(src)) {
        done++;
        send({ type: "progress", jobId, done });
        continue;
      }

      const target = join(dest, basename(src));

      if (mode === "move") {
        try {
          // Try atomic rename first (fast, same filesystem)
          renameSync(src, target);
        } catch {
          // Cross-device: fall back to copy then delete
          cpSync(src, target, { recursive: true, force: true });
          // rimraf-style delete after copy
          const { rmSync } = await import("node:fs");
          rmSync(src, { recursive: true, force: true });
        }
      } else {
        cpSync(src, target, { recursive: true, force: true });
      }

      done++;
      send({ type: "progress", jobId, done });
    } catch (err) {
      done++;
      send({ type: "progress", jobId, done });
      // Non-fatal: continue with remaining files
      console.error(`[transfer-worker] error processing ${src}:`, err.message);
    }
  }

  send({ type: "done", jobId, done });
  process.exit(0);
}

run().catch((err) => {
  send({ type: "error", jobId, error: err.message });
  process.exit(1);
});
