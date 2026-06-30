/**
 * POST /api/files/transfer — background move/copy across local and SMB.
 */
import { rename, rm, stat, readdir, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, basename, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  resolveVirtualPath, smbDownloadStream, smbUploadStream,
  smbRmRecursive, smbRm, smbStat, smbMkdir, smbRename, smbListDir,
} from "~/utils/remoteMounts";

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Move or copy (background)",
    responses: { 200: {}, 400: {} } },
});

initJobStore();

/* ── Handler ─────────────────────────────────────────────────────────────── */

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const { sources, destination, mode } = body ?? {};
  if (!Array.isArray(sources) || !sources.length || destination === undefined ||
      !["move", "copy"].includes(mode))
    throw createError({ statusCode: 400, statusMessage: "sources[], destination and mode are required" });

  const destResolved = resolveVirtualPath(destination as string);
  if (destResolved?.type === "local" && !existsSync(destResolved.absPath))
    mkdirSync(destResolved.absPath, { recursive: true });

  const jobId = randomUUID();
  globalThis.__transferJobs.set(jobId, {
    id: jobId, name: (sources as string[]).map((s) => basename(s)).join(", "),
    mode: mode as "move" | "copy", sources: sources as string[],
    destination: destination as string,
    total: (sources as string[]).length, done: 0,
    bytesTotal: 0, bytesDone: 0, status: "queued",
    queuedAt: new Date().toISOString(),
  });
  globalThis.__transferQueue.push(jobId);
  scheduleQueue();
  return { jobId };
});

/* ── Queue ───────────────────────────────────────────────────────────────── */

let _queueRunning = false;
declare global { var __transferQueueRunning: boolean | undefined; }

function scheduleQueue() {
  if (_queueRunning || globalThis.__transferQueueRunning) return;
  runNextTransfer().catch(() => { _queueRunning = false; globalThis.__transferQueueRunning = false; });
}

async function runNextTransfer(): Promise<void> {
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
    const isCancelled = (err as any)?.name === "AbortError";
    job.status = "error"; job.error = isCancelled ? "Cancelled" : String((err as any)?.message ?? err);
    job.finishedAt = new Date().toISOString();
  } finally { globalThis.__transferAbortControllers.delete(nextId); }
  _queueRunning = false; globalThis.__transferQueueRunning = false;
  void runNextTransfer();
}

/* ── Bytes ───────────────────────────────────────────────────────────────── */

async function measurePathBytes(p: string): Promise<number> {
  const r = resolveVirtualPath(p);
  if (!r) return 0;
  if (r.type === "local") {
    const s = await stat(r.absPath).catch(() => null);
    if (!s) return 0;
    if (s.isDirectory()) {
      let total = 0;
      for (const e of await readdir(r.absPath).catch(() => []))
        total += await measurePathBytes(join(p, e));
      return total;
    }
    return s.size;
  }
  const st = await smbStat(r.config, r.subPath);
  if (!st) return 0;
  return st.size;
}

async function measureBytes(paths: string[]): Promise<number> {
  let total = 0;
  for (const p of paths) total += await measurePathBytes(p);
  return total;
}

/* ── Copy logic ──────────────────────────────────────────────────────────── */

type JobRef = { bytesDone: number; bytesTotal?: number };

async function copyAnyPath(
  srcRel: string, destRel: string, job: JobRef, signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });

  const src = resolveVirtualPath(srcRel);
  const dest = resolveVirtualPath(destRel);
  if (!src || !dest) throw new Error("Invalid path");

  let srcIsDir = false;
  if (src.type === "local") {
    try { srcIsDir = (await stat(src.absPath)).isDirectory(); }
    catch { throw new Error("Source not found: " + srcRel); }
  } else {
    const st = await smbStat(src.config, src.subPath);
    if (!st) throw new Error("Source not found: " + srcRel);
    srcIsDir = st.type === "directory";
  }

  if (srcIsDir) {
    if (dest.type === "local") await mkdir(dest.absPath, { recursive: true });
    else await smbMkdir(dest.config, dest.subPath).catch(() => {});

    let children: { name: string; type: "file" | "directory" }[];
    if (src.type === "local") {
      const ents = await readdir(src.absPath, { withFileTypes: true }).catch(() => []);
      children = ents.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
    } else {
      const ents = await smbListDir(src.config, src.subPath).catch(() => []);
      children = ents.map((e: any) => ({ name: e.name, type: e.type }));
    }

    for (const child of children) {
      if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      await copyAnyPath(join(srcRel, child.name), join(destRel, child.name), job, signal);
    }
  } else {
    if (dest.type === "local") {
      const parent = dirname(dest.absPath);
      if (!existsSync(parent)) await mkdir(parent, { recursive: true });
    }

    let readable: Readable;
    if (src.type === "local") {
      readable = createReadStream(src.absPath);
    } else {
      const { stream } = smbDownloadStream(src.config, src.subPath);
      readable = stream;
    }

    readable.on("data", (chunk: Buffer) => { job.bytesDone += chunk.length; });

    if (dest.type === "local") {
      const writable = createWriteStream(dest.absPath);
      await pipeline(readable as any, writable as any, { signal } as any);
    } else {
      await smbUploadStream(dest.config, dest.subPath, readable);
    }
  }
}

async function rmAnyPath(rel: string): Promise<void> {
  const r = resolveVirtualPath(rel);
  if (!r) return;
  if (r.type === "local") await rm(r.absPath, { recursive: true, force: true }).catch(() => {});
  else { try { await smbRmRecursive(r.config, r.subPath); } catch { /* ignore */ } }
}

async function runTransfer(
  jobId: string, sources: string[], destRel: string,
  mode: "move" | "copy", signal?: AbortSignal,
) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;
  let hasError = false, lastError = "";

  for (const srcRel of sources) {
    if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    try {
      const targetRel = join(destRel, basename(srcRel));
      if (mode === "move") {
        const s = resolveVirtualPath(srcRel);
        const d = resolveVirtualPath(targetRel);
        if (s && d && s.type === "smb" && d.type === "smb" && s.config.id === d.config.id) {
          try { await smbRename(s.config, s.subPath, d.subPath); }
          catch { await copyAnyPath(srcRel, targetRel, job as JobRef, signal); await rmAnyPath(srcRel); }
        } else {
          await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
          await rmAnyPath(srcRel);
        }
      } else {
        await copyAnyPath(srcRel, targetRel, job as JobRef, signal);
      }
    } catch (err) {
      if ((err as any)?.name === "AbortError") throw err;
      hasError = true; lastError = String((err as any)?.message ?? err);
    }
    job.done++;
  }
  if (hasError) { job.status = "error"; job.error = lastError; }
  else { job.status = "done"; if (job.bytesTotal) job.bytesDone = job.bytesTotal; }
  job.finishedAt = new Date().toISOString();
}
