/**
 * Cola de transferencias en segundo plano (move/copy) compartida entre el
 * file manager y el planificador.
 *
 * Extraída de `api/files/transfer.post.ts` para que el planificador pueda
 * encolar un movimiento de archivo "como si lo hubiera hecho desde el file
 * manager" (aparece en el systray / TransferSystray y se serializa igual).
 *
 * Los jobs viven en memoria (globalThis) y se ejecutan de uno en uno. El
 * store se inicializa en `utils/files.ts` (initJobStore).
 */

import { stat, readdir } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveVirtualPath, smbStat } from "./remoteMounts";
import { movePath, copyPath } from "./transfer-engine";
import { initJobStore } from "./files";

let _queueRunning = false;
declare global {
  var __transferQueueRunning: boolean | undefined;
}

/**
 * Encola un movimiento/copia de ficheros en la cola del systray.
 * Devuelve el jobId (UUID) para poder consultar su estado.
 */
export function enqueueTransferJob(
  sources: string[],
  destination: string,
  mode: "move" | "copy",
): string {
  initJobStore();
  const destResolved = resolveVirtualPath(destination);
  if (destResolved?.type === "local" && !existsSync(destResolved.absPath)) {
    mkdirSync(destResolved.absPath, { recursive: true });
  }

  const jobId = randomUUID();
  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: sources.map((s) => basename(s)).join(", "),
    mode: mode as "move" | "copy",
    sources,
    destination,
    total: sources.length,
    done: 0,
    bytesTotal: 0,
    bytesDone: 0,
    status: "queued",
    queuedAt: new Date().toISOString(),
  });
  globalThis.__transferQueue.push(jobId);
  scheduleQueue();
  return jobId;
}

/** True si ya hay un job activo (queued/running) moviendo o copiando `virtual`. */
export function isPathInActiveTransfer(virtual: string): boolean {
  for (const job of globalThis.__transferJobs?.values() ?? []) {
    if (job.status !== "queued" && job.status !== "running") continue;
    if ((job.sources ?? []).includes(virtual)) return true;
  }
  return false;
}

/* ── Queue ───────────────────────────────────────────────────────────────── */

function scheduleQueue() {
  if (_queueRunning || globalThis.__transferQueueRunning) return;
  runNextTransfer().catch(() => {
    _queueRunning = false;
    globalThis.__transferQueueRunning = false;
  });
}

async function runNextTransfer(): Promise<void> {
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
    const isCancelled = (err as any)?.name === "AbortError";
    job.status = "error";
    job.error = isCancelled ? "Cancelled" : String((err as any)?.message ?? err);
    job.finishedAt = new Date().toISOString();
  } finally {
    globalThis.__transferAbortControllers.delete(nextId);
  }
  _queueRunning = false;
  globalThis.__transferQueueRunning = false;
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
  jobId: string,
  sources: string[],
  destRel: string,
  mode: "move" | "copy",
  signal?: AbortSignal,
) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;
  let hasError = false;
  let lastError = "";

  const opts = {
    signal,
    onBytes: (n: number) => {
      job.bytesDone += n;
    },
  };

  for (const srcRel of sources) {
    if (signal?.aborted)
      throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    try {
      const targetRel = join(destRel, basename(srcRel));
      if (mode === "move") await movePath(srcRel, targetRel, opts);
      else await copyPath(srcRel, targetRel, opts);
    } catch (err) {
      if ((err as any)?.name === "AbortError") throw err;
      hasError = true;
      lastError = String((err as any)?.message ?? err);
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
