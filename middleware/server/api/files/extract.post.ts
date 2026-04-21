/**
 * POST /api/files/extract
 *
 * Starts a background extraction job for a compressed archive.
 * Returns a jobId immediately; actual work runs fire-and-forget in the same process.
 *
 * Extraction strategy: 7-Zip 26.00 CLI only.
 *
 * Body: { source: string, destination: string }
 * Returns: { jobId: string }
 */

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import os from "node:os";
import sevenBin from "7zip-bin";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Extract a compressed archive (background job)",
    responses: {
      200: { description: "Job started" },
      400: { description: "Invalid parameters" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { source, destination } = body ?? {};

  if (
    typeof source !== "string" ||
    !source ||
    destination === undefined ||
    destination === null
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "source and destination are required",
    });
  }

  const root = getDownloadsRoot();
  const absSrc = resolveSafe(root, source as string);
  const absDest =
    typeof destination === "string" && destination !== ""
      ? resolveSafe(root, destination as string)
      : root;

  if (!existsSync(absSrc)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Source file not found",
    });
  }

  const destExisted = existsSync(absDest);
  if (!destExisted) {
    try {
      mkdirSync(absDest, { recursive: true });
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Cannot create destination directory",
      });
    }
  }

  initJobStore();
  const jobId = randomUUID();

  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: absSrc.split("/").pop() ?? absSrc,
    mode: "extract",
    sources: [absSrc],
    destination: absDest,
    total: 1,
    done: 0,
    status: "running",
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  });

  // Fire-and-forget
  runExtract(jobId, absSrc, absDest, !destExisted).catch((err) => {
    const job = globalThis.__transferJobs.get(jobId);
    if (job && job.status !== "error") {
      job.status = "error";
      job.error = String(err?.message ?? err);
      job.finishedAt = new Date().toISOString();
    }
  });

  return { jobId };
});

// ── Extraction helpers ────────────────────────────────────────────────────────

function tryCleanup(dest: string) {
  try {
    rmdirSync(dest); // only succeeds if the directory is still empty
  } catch {
    /* ignore */
  }
}

async function runExtract(
  jobId: string,
  src: string,
  dest: string,
  destCreatedByUs: boolean,
): Promise<void> {
  await extract7z(jobId, src, dest, destCreatedByUs);
}

/** Extract any archive using 7-Zip 26.00 (RAR3/RAR5, ZIP, 7z, tar.*, gz, bz2, xz…). */
function extract7z(
  jobId: string,
  src: string,
  dest: string,
  destCreatedByUs: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Lower memory usage when possible by forcing single-thread extraction.
    const args = ["x", src, `-o${dest}`, "-y", "-aoa", "-mmt=1"];
    const child = spawn(sevenBin.path7za, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        const job = globalThis.__transferJobs.get(jobId);
        if (job) {
          job.done = 1;
          job.status = "done";
          job.finishedAt = new Date().toISOString();
        }
        resolve();
        return;
      }

      const combined = `${stdout}\n${stderr}`;
      const memoryError = /Can't allocate required memory|E_OUTOFMEMORY/i.test(
        combined,
      );

      const job = globalThis.__transferJobs.get(jobId);
      const diagnostics = buildMemoryDiagnostics(src);
      const rawMessage = (
        stderr ||
        stdout ||
        `7za exited with code ${code}`
      ).trim();
      const userMessage = memoryError
        ? [
            "Can't allocate required memory. Extraction does not load the full archive into RAM, but 7-Zip still needs working memory for RAR dictionaries.",
            diagnostics,
            "Try increasing container memory/swap or extracting on host with more RAM.",
          ]
            .filter(Boolean)
            .join(" ")
        : rawMessage;

      if (job) {
        job.status = "error";
        job.error = userMessage;
        job.finishedAt = new Date().toISOString();
      }
      if (destCreatedByUs) tryCleanup(dest);
      reject(new Error(userMessage));
    });

    child.on("error", (err) => {
      const job = globalThis.__transferJobs.get(jobId);
      const rawMessage = err?.message ?? String(err);
      if (job) {
        job.status = "error";
        job.error = rawMessage;
        job.finishedAt = new Date().toISOString();
      }
      if (destCreatedByUs) tryCleanup(dest);
      reject(new Error(rawMessage));
    });
  });
}

function buildMemoryDiagnostics(src: string): string {
  const method = getArchiveMethod(src);
  const dictBytes = parseDictionaryBytes(method);
  const availableBytes = getAvailableMemoryBytes();

  const parts: string[] = [];
  if (method) parts.push(`Archive method: ${method}.`);
  if (dictBytes > 0)
    parts.push(`Estimated dictionary: ${formatBytes(dictBytes)}.`);
  if (availableBytes > 0) {
    parts.push(`Available memory: ${formatBytes(availableBytes)}.`);
    if (dictBytes > 0 && availableBytes < dictBytes) {
      parts.push("Available memory is lower than the archive dictionary.");
    }
  }

  return parts.join(" ");
}

function getArchiveMethod(src: string): string {
  try {
    const res = spawnSync(sevenBin.path7za, ["l", "-slt", src], {
      encoding: "utf8",
      timeout: 15000,
    });
    const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    const match = output.match(/^Method\s*=\s*(.+)$/m);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

function parseDictionaryBytes(method: string): number {
  if (!method) return 0;
  const tokenRe = /(?:^|:)(\d+)([KMG])(?:$|:)/gi;
  let max = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(method)) !== null) {
    const value = Number(match[1]);
    const unit = (match[2] ?? "").toUpperCase();
    if (!Number.isFinite(value) || value <= 0) continue;
    const bytes =
      unit === "G"
        ? value * 1024 * 1024 * 1024
        : unit === "M"
          ? value * 1024 * 1024
          : value * 1024;
    if (bytes > max) max = bytes;
  }
  return max;
}

function getAvailableMemoryBytes(): number {
  const limit = readCgroupNumber("/sys/fs/cgroup/memory.max");
  const current = readCgroupNumber("/sys/fs/cgroup/memory.current");
  if (limit > 0 && current >= 0) {
    return Math.max(0, limit - current);
  }

  // Fallback to process-visible free memory when cgroup values are unavailable.
  return os.freemem();
}

function readCgroupNumber(path: string): number {
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw || raw === "max") return -1;
    const n = Number(raw);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  const decimals = value >= 10 || idx === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[idx]}`;
}
