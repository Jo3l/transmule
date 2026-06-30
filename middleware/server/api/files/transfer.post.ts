/**
 * POST /api/files/transfer
 *
 * Starts a background move or copy job.
 * Returns a jobId immediately; the actual work runs fire-and-forget.
 *
 * All paths are resolved through the virtual filesystem (downloads/ or SMB mounts).
 * Since SMB shares are mounted via the kernel, all operations use native fs calls.
 */

import { rename, rm, stat, readdir, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, basename, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "~/utils/remoteMounts";
import { getDownloadsRoot } from "~/utils/files";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Move or copy files/folders (background job)",
    responses: {
      200: { description: "Job started" },
      400: { description: "Invalid parameters" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

initJobStore();

/* ── Path resolution ─────────────────────────────────────────────────────── */

async function ensurePathMounted(relPath: string): Promise<string> {
  const real = resolveVirtualPath(relPath);
  if (!real) throw new Error("Invalid path: " + relPath);
  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = clean.split("/")[0];
  if (firstSeg !== "downloads") {
    const cfg = getSmbConfigByName(firstSeg);
    if (cfg) await ensureSmbMounted(cfg);
  }
  return real;
}

/* ── Handler ─────────────────────────────────────────────────────────────── */

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { sources, destination, mode } = body ?? {};

  if (
    !Array.isArray(sources) || !sources.length ||
    destination === undefined || destination === null ||
    !["move", "copy"].includes(mode)
  ) {
    throw createError({ statusCode: 400, statusMessage: "sources[], destination and mode are required" });
  }

  // Ensure destination exists
  const destPath = await ensurePathMounted(destination as string);
  if (!existsSync(destPath)) {
    try { mkdirSync(destPath, { recursive: true }); } catch {
      throw createError({ statusCode: 400, statusMessage: "Cannot create destination directory" });
    }
  }

  const jobId = randomUUID();
  const jobName = (sources as string[]).map((s) => basename(s)).join(", ");

  globalThis.__transferJobs.set(jobId, {
    id: jobId, name: jobName, mode: mode as "move" | "copy",
    sources: sources as string[], destination: destination as string,
    total: (sources as string[]).length, done: 0,
    bytesTotal: 0, bytesDone: 0,
    status: "queued", queuedAt: new Date().toISOString(),
  });

  globalThis.__transferQueue.push(jobId);
  scheduleQueue();

  return { jobId };
});

/* ── Backend queue processing ────────────────────────────────────────────── */

let _queueRunning = false;
declare global { var __transferQueueRunning: boolean | undefined; }

function scheduleQueue() {
  if (_queueRunning || globalThis.__transferQueueRunning) return;
  runNextTransfer().catch(() => { _queueRunning = false; globalThis.__transferQueueRunning = false; });
}

async function runNextTransfer(): Promise<void> {
  try {
    const nextId = globalThis.__transferQueue?.shift();
    if (!nextId) { _queueRunning = false; globalThis.__transferQueueRunning = false; return; }
    const job = globalThis.__transferJobs?.get(nextId);
    if (!job) { void runNextTransfer(); return; }

    _queueRunning = true; globalThis.__transferQueueRunning = true;
    job.status = "running"; job.startedAt = new Date().toISOString();

    const abortCtrl = new AbortController();
    globalThis.__transferAbortControllers.set(nextId, abortCtrl);

    try {
      job.bytesTotal = await measureBytes(job.sources).catch(() => 0);
      await runTransfer(nextId, job.sources, job.destination, job.mode as "move" | "copy", abortCtrl.signal);
    } catch (err) {
      const isCancelled = (err as any)?.name === "AbortError" || (err as any)?.message === "Cancelled";
      job.status = "error";
      job.error = isCancelled ? "Cancelled" : String((err as any)?.message ?? err);
      job.finishedAt = new Date().toISOString();
    } finally {
      globalThis.__transferAbortControllers.delete(nextId);
    }

    _queueRunning = false; globalThis.__transferQueueRunning = false;
    void runNextTransfer();
  } catch { _queueRunning = false; globalThis.__transferQueueRunning = false; void runNextTransfer(); }
}

/* ── Byte measurement ────────────────────────────────────────────────────── */

async function measurePathBytes(p: string): Promise<number> {
  const real = resolveVirtualPath(p);
  if (!real) return 0;
  const s = await stat(real).catch(() => null);
  if (!s) return 0;
  if (s.isDirectory()) {
    const entries = await readdir(real).catch(() => []);
    let total = 0;
    for (const entry of entries) total += await measurePathBytes(join(p, entry));
    return total;
  }
  return s.size;
}

async function measureBytes(paths: string[]): Promise<number> {
  let total = 0;
  for (const p of paths) total += await measurePathBytes(p);
  return total;
}

/* ── Generic copy with progress ──────────────────────────────────────────── */

type JobRef = { bytesDone: number; bytesTotal?: number };

async function copyAnyPath(srcRel: string, destRel: string, job: JobRef, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });

  const srcPath = resolveVirtualPath(srcRel);
  const destPath = resolveVirtualPath(destRel);
  if (!srcPath || !destPath) throw new Error("Invalid path");

  const srcSt = await stat(srcPath).catch(() => null);
  if (!srcSt) throw new Error("Source not found: " + srcRel);

  if (srcSt.isDirectory()) {
    await mkdir(destPath, { recursive: true }).catch(() => {});
    const children = await readdir(srcPath).catch(() => []);
    for (const child of children) {
      if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      await copyAnyPath(join(srcRel, child), join(destRel, child), job, signal);
    }
  } else {
    const parentDir = dirname(destPath);
    if (!existsSync(parentDir)) await mkdir(parentDir, { recursive: true });

    const readable = createReadStream(srcPath);
    const writable = createWriteStream(destPath);

    readable.on("data", (chunk: Buffer) => { job.bytesDone += chunk.length; });

    const PIPE_TIMEOUT = 1800000; // 30 min
    const pipeTask = pipeline(readable as any, writable as any, { signal } as any);
    const timeoutTask = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Pipeline timeout")), PIPE_TIMEOUT));

    try { await Promise.race([pipeTask, timeoutTask]); } catch (err: any) {
      readable.destroy?.();
      try { writable.end?.(); } catch { /* ignore */ }
      // If 95%+ transferred, treat as success
      const destExists = existsSync(destPath);
      if (destExists) {
        const ratio = job.bytesTotal && job.bytesTotal > 0 ? job.bytesDone / job.bytesTotal : 0;
        if (ratio > 0 && ratio < 0.95) throw err;
        return;
      }
      throw err;
    }
  }
}

async function rmAnyPath(rel: string): Promise<void> {
  const real = resolveVirtualPath(rel);
  if (!real) return;
  await rm(real, { recursive: true, force: true }).catch(() => {});
}

async function existsAny(rel: string): Promise<boolean> {
  const real = resolveVirtualPath(rel);
  if (!real) return false;
  return existsSync(real);
}

async function runTransfer(jobId: string, sources: string[], destRel: string, mode: "move" | "copy", signal?: AbortSignal) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;

  let hasError = false;
  let lastError = "";

  for (const srcRel of sources) {
    if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });

    try {
      if (!(await existsAny(srcRel))) { hasError = true; lastError = `Source not found: ${srcRel}`; job.done++; continue; }
      const targetRel = join(destRel, basename(srcRel));

      if (mode === "move") {
        // Try fast rename first
        const srcPath = resolveVirtualPath(srcRel);
        const tgtPath = resolveVirtualPath(targetRel);
        if (srcPath && tgtPath) {
          try {
            const srcSize = await measurePathBytes(srcRel).catch(() => 0);
            await rename(srcPath, tgtPath);
            if (job.bytesDone !== undefined) job.bytesDone += srcSize;
          } catch {
            await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
            await rmAnyPath(srcRel);
          }
        }
      } else {
        await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
      }
    } catch (err) {
      if ((err as any)?.name === "AbortError" || (err as any)?.message === "Cancelled") throw err;
      hasError = true; lastError = String((err as any)?.message ?? err);
    }
    job.done++;
  }

  if (hasError) { job.status = "error"; job.error = lastError; }
  else { job.status = "done"; if (job.bytesTotal) job.bytesDone = job.bytesTotal; }
  job.finishedAt = new Date().toISOString();
}
