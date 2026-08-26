/**
 * POST /api/files/transfer — background move/copy across local and SMB.
 */
import { stat, readdir } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveVirtualPath, smbStat } from "~/utils/remoteMounts";
import { movePath, copyPath } from "~/utils/transfer-engine";

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

/* ── Queue runner (usa el motor compartido transfer-engine) ────────────────── */

async function runTransfer(
  jobId: string, sources: string[], destRel: string,
  mode: "move" | "copy", signal?: AbortSignal,
) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;
  let hasError = false, lastError = "";

  const opts = { signal, onBytes: (n: number) => { job.bytesDone += n; } };

  for (const srcRel of sources) {
    if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    try {
      const targetRel = join(destRel, basename(srcRel));
      if (mode === "move") await movePath(srcRel, targetRel, opts);
      else await copyPath(srcRel, targetRel, opts);
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
