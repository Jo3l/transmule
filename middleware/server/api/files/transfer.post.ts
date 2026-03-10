/**
 * POST /api/files/transfer
 *
 * Starts a background move or copy job.
 * Returns a jobId immediately; the actual work runs as a fire-and-forget
 * async task in the same process so the HTTP response returns instantly.
 *
 * Body: { sources: string[], destination: string, mode: "move" | "copy" }
 * Returns: { jobId: string }
 */

import { rename, rm, stat, readdir, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, basename } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

// Ensure the in-process job store is initialised (declared + initialised in server/utils/files.ts).
initJobStore();

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { sources, destination, mode } = body ?? {};

  if (
    !Array.isArray(sources) ||
    !sources.length ||
    destination === undefined ||
    destination === null ||
    !["move", "copy"].includes(mode)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "sources[], destination and mode are required",
    });
  }

  const root = getDownloadsRoot();

  // Validate all source paths
  const absSources: string[] = (sources as string[]).map((s) =>
    resolveSafe(root, s),
  );
  const absDest: string = resolveSafe(root, destination as string);

  // Destination must be a directory (or creatable)
  if (!existsSync(absDest)) {
    try {
      mkdirSync(absDest, { recursive: true });
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Cannot create destination directory",
      });
    }
  }

  const jobId = randomUUID();
  const jobName = absSources.map((s) => basename(s)).join(", ");

  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: jobName,
    mode: mode as "move" | "copy",
    sources: absSources,
    destination: absDest,
    total: absSources.length,
    done: 0,
    bytesTotal: 0,
    bytesDone: 0,
    status: "queued",
    queuedAt: new Date().toISOString(),
  });

  globalThis.__transferQueue.push(jobId);
  scheduleQueue();

  return { jobId };
});

// ── Backend queue processing ──────────────────────────────────────────────
// Runs transfer jobs one at a time server-side; survives frontend reloads.

let _queueRunning = false;

function scheduleQueue() {
  if (_queueRunning) return;
  void runNextTransfer();
}

async function runNextTransfer(): Promise<void> {
  const nextId = globalThis.__transferQueue?.shift();
  if (!nextId) {
    _queueRunning = false;
    return;
  }

  const job = globalThis.__transferJobs?.get(nextId);
  if (!job) {
    // Stale queue entry — skip and try the next one
    void runNextTransfer();
    return;
  }

  _queueRunning = true;
  job.status = "running";
  job.startedAt = new Date().toISOString();

  const abortCtrl = new AbortController();
  globalThis.__transferAbortControllers.set(nextId, abortCtrl);

  try {
    job.bytesTotal = await measureBytes(job.sources).catch(() => 0);
    await runTransfer(
      nextId,
      job.sources,
      job.destination,
      job.mode as "move" | "copy",
      abortCtrl.signal,
    );
  } catch (err) {
    const isCancelled =
      (err as any)?.name === "AbortError" ||
      (err as any)?.message === "Cancelled";
    job.status = "error";
    job.error = isCancelled
      ? "Cancelled"
      : String((err as any)?.message ?? err);
    job.finishedAt = new Date().toISOString();
  } finally {
    globalThis.__transferAbortControllers.delete(nextId);
  }

  _queueRunning = false;
  void runNextTransfer(); // process the next job in the queue
}

// ── Byte-measurement helpers ──────────────────────────────────────────────

async function measurePathBytes(p: string): Promise<number> {
  const s = await stat(p);
  if (s.isDirectory()) {
    const entries = await readdir(p);
    let total = 0;
    for (const entry of entries) {
      total += await measurePathBytes(join(p, entry));
    }
    return total;
  }
  return s.size;
}

async function measureBytes(paths: string[]): Promise<number> {
  let total = 0;
  for (const p of paths) {
    total += await measurePathBytes(p);
  }
  return total;
}

// ── Stream-based copy with byte-level progress ────────────────────────────

type JobRef = { bytesDone: number };

async function copyPathWithProgress(
  src: string,
  dest: string,
  job: JobRef,
  signal?: AbortSignal,
): Promise<void> {
  const s = await stat(src);
  if (s.isDirectory()) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src);
    for (const entry of entries) {
      if (signal?.aborted)
        throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      await copyPathWithProgress(
        join(src, entry),
        join(dest, entry),
        job,
        signal,
      );
    }
  } else {
    const readable = createReadStream(src);
    const writable = createWriteStream(dest);
    readable.on("data", (chunk: Buffer) => {
      job.bytesDone += chunk.length;
    });
    await pipeline(readable, writable, { signal } as any);
  }
}

async function runTransfer(
  jobId: string,
  sources: string[],
  dest: string,
  mode: "move" | "copy",
  signal?: AbortSignal,
) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;

  for (const src of sources) {
    if (signal?.aborted)
      throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    try {
      if (!existsSync(src)) {
        job.done++;
        continue;
      }

      const target = join(dest, basename(src));

      if (mode === "move") {
        // Measure size before rename (src path disappears after rename)
        const srcSize = await measurePathBytes(src).catch(() => 0);
        try {
          // Atomic rename — instant on same filesystem
          await rename(src, target);
          if (job.bytesDone !== undefined) job.bytesDone += srcSize;
        } catch {
          // Cross-device: stream-copy then delete
          await copyPathWithProgress(src, target, job as JobRef, signal);
          await rm(src, { recursive: true, force: true });
        }
      } else {
        await copyPathWithProgress(src, target, job as JobRef, signal);
      }
    } catch (err) {
      if (
        (err as any)?.name === "AbortError" ||
        (err as any)?.message === "Cancelled"
      )
        throw err;
      console.error(`[transfer] error processing ${src}:`, err);
    }

    job.done++;
  }

  // Clamp to totals in case of rounding / skipped files
  job.done = job.total;
  if (job.bytesTotal) job.bytesDone = job.bytesTotal;
  job.status = "done";
  job.finishedAt = new Date().toISOString();
}
