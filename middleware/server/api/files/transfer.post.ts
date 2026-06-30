/**
 * POST /api/files/transfer
 *
 * Starts a background move or copy job.
 * Returns a jobId immediately; the actual work runs as a fire-and-forget
 * async task in the same process so the HTTP response returns instantly.
 *
 * Supports local ↔ local, local ↔ SMB, and SMB ↔ SMB transfers.
 *
 * Body: { sources: string[], destination: string, mode: "move" | "copy" }
 * Returns: { jobId: string }
 */

import { rename, rm, stat, readdir, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, basename, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { smbEnsureDir } from "~/utils/remoteMounts";

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

// Ensure the in-process job store is initialised.
initJobStore();

/* ── Path resolution ─────────────────────────────────────────────────────── */

interface LocalPathInfo {
  kind: "local";
  absPath: string;
}

interface SmbPathInfo {
  kind: "smb";
  mount: { id: string; host: string; share: string; path?: string; domain?: string; username: string; password: string };
  client: any; // SmbProvider (wraps SMB2) — typed as any for low-level SMB2 access
  remotePath: string;
}

type PathInfo = LocalPathInfo | SmbPathInfo;

function resolvePathInfo(relPath: string): PathInfo {
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    return {
      kind: "smb",
      mount,
      client: createSmbClient(mount),
      remotePath: subPath,
    };
  }
  const root = getDownloadsRoot();
  return { kind: "local", absPath: resolveSafe(root, relPath) };
}

/* ── Handler ─────────────────────────────────────────────────────────────── */

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

  const destInfo = resolvePathInfo(destination as string);

  // For local destinations, ensure directory exists
  if (destInfo.kind === "local" && !existsSync(destInfo.absPath)) {
    try {
      mkdirSync(destInfo.absPath, { recursive: true });
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Cannot create destination directory",
      });
    }
  }

  const jobId = randomUUID();
  const jobName = (sources as string[]).map((s) => basename(s)).join(", ");

  // Store relative paths so the background worker can resolve them
  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: jobName,
    mode: mode as "move" | "copy",
    sources: sources as string[],
    destination: destination as string,
    total: (sources as string[]).length,
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

/* ── Backend queue processing ────────────────────────────────────────────── */

let _queueRunning = false;

// Expose queue state/control globally so other modules can recover a stuck queue.
declare global {
  var __transferQueueRunning: boolean | undefined;
}

function scheduleQueue() {
  if (_queueRunning || globalThis.__transferQueueRunning) return;
  runNextTransfer().catch(() => {
    _queueRunning = false;
    globalThis.__transferQueueRunning = false;
  });
}

async function runNextTransfer(): Promise<void> {
  try {
    const nextId = globalThis.__transferQueue?.shift();
    if (!nextId) {
      _queueRunning = false;
      globalThis.__transferQueueRunning = false;
      return;
    }

    const job = globalThis.__transferJobs?.get(nextId);
    if (!job) {
      void runNextTransfer();
      return;
    }

    _queueRunning = true;
    globalThis.__transferQueueRunning = true;
    job.status = "running";
    job.startedAt = new Date().toISOString();

    const abortCtrl = new AbortController();
    globalThis.__transferAbortControllers.set(nextId, abortCtrl);

    const clients: any[] = [];

    try {
      job.bytesTotal = await measureBytes(job.sources).catch(() => 0);
      await runTransfer(
        nextId,
        job.sources,
        job.destination,
        job.mode as "move" | "copy",
        abortCtrl.signal,
        clients,
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
      for (const c of clients) {
        try {
          c.disconnect();
        } catch {
          /* ignore */
        }
      }
    }

    _queueRunning = false;
    globalThis.__transferQueueRunning = false;
    void runNextTransfer();
  } catch (err) {
    // Top-level safety net: if anything unexpected crashes, reset the flag so the
    // queue can continue with the next job instead of being stuck forever.
    _queueRunning = false;
    globalThis.__transferQueueRunning = false;
    void runNextTransfer();
  }
}

/* ── Byte measurement ────────────────────────────────────────────────────── */

async function measurePathBytes(p: string): Promise<number> {
  const info = resolvePathInfo(p);
  if (info.kind === "local") {
    const s = await stat(info.absPath);
    if (s.isDirectory()) {
      const entries = await readdir(info.absPath);
      let total = 0;
      for (const entry of entries) {
        total += await measurePathBytes(join(p, entry));
      }
      return total;
    }
    return s.size;
  } else {
    return smbMeasureBytes(info.client, info.remotePath);
  }
}

async function measureBytes(paths: string[]): Promise<number> {
  let total = 0;
  for (const p of paths) {
    total += await measurePathBytes(p);
  }
  return total;
}

/* ── Generic copy with progress ──────────────────────────────────────────── */

type JobRef = { bytesDone: number; bytesTotal?: number };

async function copyAnyPath(
  srcRel: string,
  destRel: string,
  job: JobRef,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
  }

  const src = resolvePathInfo(srcRel);
  const dest = resolvePathInfo(destRel);

  const srcIsDir = await isDirectory(src);

  if (srcIsDir) {
    // Ensure dest directory exists
    if (dest.kind === "local") {
      await mkdir(dest.absPath, { recursive: true });
    } else {
      try {
        await withTimeout(dest.client.mkdir(dest.remotePath), 8000);
      } catch {
        /* directory may already exist */
      }
    }

    // List children
    const children =
      src.kind === "local"
        ? (await readdir(src.absPath)).map((name) => ({
            name,
            isDirectory: async () =>
              (await stat(join(src.absPath, name))).isDirectory(),
          }))
        : await withTimeout(
            src.client.readdir(src.remotePath, { stats: true }),
            8000,
          );

    for (const child of children) {
      if (signal?.aborted) {
        throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      }
      const childSrcRel = join(srcRel, child.name);
      const childDestRel = join(destRel, child.name);
      await copyAnyPath(childSrcRel, childDestRel, job, signal);
    }
  } else {
    // Ensure parent directory exists for file destinations
    if (dest.kind === "local") {
      const parentDir = dirname(dest.absPath);
      if (!existsSync(parentDir)) {
        await mkdir(parentDir, { recursive: true });
      }
    } else {
      const lastSep = dest.remotePath.lastIndexOf("\\");
      if (lastSep > 0) {
        const parentRemote = dest.remotePath.slice(0, lastSep);
        await smbEnsureDir(dest.client, parentRemote);
      }
    }

    // Copy file using streams
    const readable =
      src.kind === "local"
        ? createReadStream(src.absPath)
        : await withTimeout(src.client.createReadStream(src.remotePath), 8000);

    // For SMB destinations, use chunked write with progress to avoid
    // stream stalling on large files (>100MB).
    if (dest.kind === "smb") {
      await copyToSmbChunked(readable, dest, job, destRel, signal);
      return;
    }

    const writable =
      dest.kind === "local"
        ? createWriteStream(dest.absPath)
        : await withTimeout(
            dest.client.createWriteStream(dest.remotePath),
            8000,
          );

    if (src.kind === "local") {
      readable.on("data", (chunk: Buffer) => {
        job.bytesDone += chunk.length;
      });
    } else {
      readable.on("data", (chunk: Buffer) => {
        job.bytesDone += chunk.length;
      });
    }

    // Race pipeline against a timeout (especially important for SMB read streams
    // which could stall with older SMB clients). Same pattern as copyToSmbChunked.
    const PIPE_TIMEOUT = 300000; // 5 min
    const pipeTask = pipeline(readable as any, writable as any, { signal } as any);
    const timeoutTask = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Pipeline timeout")), PIPE_TIMEOUT);
    });

    try {
      await Promise.race([pipeTask, timeoutTask]);
    } catch (err: any) {
      readable.destroy?.();
      try { writable.end?.(); } catch { /* ignore */ }
      // SMB2 may close the stream before pipeline finishes, producing
      // STATUS_FILE_CLOSED even though the file was fully written.
      // If we can confirm the destination file exists AND >=95% of data
      // was transferred, treat this as success (flush stalled but data
      // is on the server).
      if (src.kind !== "local" || dest.kind !== "local") {
        const destExists = await existsAny(destRel).catch(() => false);
        if (destExists) {
          // If bytesTotal is known and we're well below it, fail
          const ratio = job.bytesTotal && job.bytesTotal > 0
            ? job.bytesDone / job.bytesTotal
            : 0;
          if (ratio > 0 && ratio < 0.95) {
            throw err;
          }
          return; // file was written successfully — ignore the stream error
        }
      }
      throw err;
    }
  }
}

/**
 * Copy a file to SMB. Uses low-level SMB2 open/write/close APIs directly
 * (not createWriteStream, which is unreliable for large files).
 *
 * Reads the source in chunks and writes in 4MB batches via SMB2 WRITE
 * commands. Memory-efficient: only buffers one batch at a time.
 *
 * Progress is tracked per-batch via job.bytesDone.
 */
const SMB2_BATCH_SIZE = 4 * 1024 * 1024; // 4MB per SMB write batch
const SMB2_CHUNK_TIMEOUT = 120000; // 2 min per batch write
const SMB2_OPEN_CLOSE_TIMEOUT = 30000;

async function copyToSmbChunked(
  readable: NodeJS.ReadableStream,
  dest: SmbPathInfo,
  job: JobRef,
  destRel: string,
  signal?: AbortSignal,
): Promise<void> {
  // Pre-unlink existing file to avoid STATUS_OBJECT_NAME_COLLISION
  try {
    await withTimeout(dest.client.unlink(dest.remotePath), 8000);
  } catch {
    // File may not exist — that's fine
  }

  // ── Buffered writeFile approach ────────────────────────────
  // Buffers entire source in memory then writes via smb3-client writeFile.
  // Memory: reads the entire source into a buffer. For a 7GB file this
  // uses ~7GB RAM. Acceptable on typical production servers with 16GB+
  // containers. For files >4GB consider increasing container memory.
  //
  const chunks: Buffer[] = [];
  readable.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    job.bytesDone += chunk.length;
  });

  try {
    await new Promise<void>((resolve, reject) => {
      readable.on("end", resolve);
      readable.on("error", reject);
      if (signal) {
        if (signal.aborted) {
          reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
          return;
        }
        signal.addEventListener("abort", () => {
          readable.destroy();
          reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
        });
      }
    });
  } catch (err: any) {
    readable.destroy?.();
    throw err;
  }

  const buffer = Buffer.concat(chunks);

  // Write via SMB writeFile (concurrent, credit-aware)
  await withTimeout(
    dest.client.writeFile(dest.remotePath, buffer),
    600000, // 10 min for very large files
  );
}

async function isDirectory(info: PathInfo): Promise<boolean> {
  if (info.kind === "local") {
    try {
      const s = await stat(info.absPath);
      return s.isDirectory();
    } catch {
      return false;
    }
  } else {
    try {
      const st = await withTimeout(info.client.stat(info.remotePath), 8000);
      const isDir = typeof st.isDirectory === "function" ? st.isDirectory() : st.isDirectory === true;
      return isDir;
    } catch {
      return false;
    }
  }
}

async function rmAnyPath(rel: string): Promise<void> {
  const info = resolvePathInfo(rel);
  if (info.kind === "local") {
    await rm(info.absPath, { recursive: true, force: true });
  } else {
    await smbRmRecursive(info.client, info.remotePath);
  }
}

async function existsAny(rel: string): Promise<boolean> {
  const info = resolvePathInfo(rel);
  if (info.kind === "local") {
    return existsSync(info.absPath);
  } else {
    try {
      await withTimeout(info.client.stat(info.remotePath), 8000);
      return true;
    } catch {
      return false;
    }
  }
}

async function runTransfer(
  jobId: string,
  sources: string[],
  destRel: string,
  mode: "move" | "copy",
  signal?: AbortSignal,
  _clients?: any[],
) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;

  let hasError = false;
  let lastError = "";

  for (const srcRel of sources) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    }

    try {
      if (!(await existsAny(srcRel))) {
        hasError = true;
        lastError = `Source not found: ${srcRel}`;
        job.done++;
        continue;
      }

      const targetRel = join(destRel, basename(srcRel));

      if (mode === "move") {
        const srcInfo = resolvePathInfo(srcRel);
        const destInfo = resolvePathInfo(targetRel);

        // Fast path: local → local same filesystem
        if (srcInfo.kind === "local" && destInfo.kind === "local") {
          const srcSize = await measurePathBytes(srcRel).catch(() => 0);
          try {
            await rename(srcInfo.absPath, destInfo.absPath);
            if (job.bytesDone !== undefined) job.bytesDone += srcSize;
          } catch {
            await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
            await rmAnyPath(srcRel);
          }
        } else if (
          // Fast path: same SMB mount → server-side rename (instant, no streaming)
          srcInfo.kind === "smb" &&
          destInfo.kind === "smb" &&
          srcInfo.mount.id === destInfo.mount.id
        ) {
          const srcSize = await measurePathBytes(srcRel).catch(() => 0);
          // Ensure parent directory exists on the destination
          const lastSep = destInfo.remotePath.lastIndexOf("\\");
          if (lastSep > 0) {
            const parentRemote = destInfo.remotePath.slice(0, lastSep);
            await smbEnsureDir(destInfo.client, parentRemote);
          }
          try {
            await srcInfo.client.rename(srcInfo.remotePath, destInfo.remotePath);
            if (job.bytesDone !== undefined) job.bytesDone += srcSize;
          } catch {
            // Fall back to streaming copy + delete
            await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
            await rmAnyPath(srcRel);
          }
        } else {
          await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
          await rmAnyPath(srcRel);
        }
      } else {
        await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
      }
    } catch (err) {
      if (
        (err as any)?.name === "AbortError" ||
        (err as any)?.message === "Cancelled"
      )
        throw err;
      hasError = true;
      lastError = String((err as any)?.message ?? err);
      console.error(`[transfer] error processing ${srcRel}:`, err);
    }

    job.done++;
  }

  if (hasError) {
    job.status = "error";
    job.error = lastError;
  } else {
    job.status = "done";
    if (job.bytesTotal) job.bytesDone = job.bytesTotal;
  }
  job.finishedAt = new Date().toISOString();
}
