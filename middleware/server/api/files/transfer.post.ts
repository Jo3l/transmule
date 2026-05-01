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
import type SMB2 from "@marsaud/smb2";
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
  client: SMB2;
  remotePath: string;
}

type PathInfo = LocalPathInfo | SmbPathInfo;

function resolvePathInfo(relPath: string): PathInfo {
  const mountInfo = resolveMountPath(relPath);
  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    const remotePath = buildRemotePath(mount, subPath);
    return {
      kind: "smb",
      mount,
      client: createSmbClient(mount),
      remotePath,
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
    void runNextTransfer();
    return;
  }

  _queueRunning = true;
  job.status = "running";
  job.startedAt = new Date().toISOString();

  const abortCtrl = new AbortController();
  globalThis.__transferAbortControllers.set(nextId, abortCtrl);

  const clients: SMB2[] = [];

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
  void runNextTransfer();
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

type JobRef = { bytesDone: number };

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

    const writable =
      dest.kind === "local"
        ? createWriteStream(dest.absPath)
        : await withTimeout(
            dest.client.createWriteStream(dest.remotePath, { flags: "w" }),
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

    await pipeline(readable as any, writable as any, { signal } as any);
  }
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
      return st.isDirectory();
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
  _clients?: SMB2[],
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
