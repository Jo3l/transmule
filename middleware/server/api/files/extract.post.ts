/**
 * POST /api/files/extract
 *
 * Starts a background extraction job for a compressed archive.
 * Returns a jobId immediately; actual work runs fire-and-forget in the same process.
 *
 * Extraction strategy: unar CLI.
 * Progress: lsar -j for total file count; unar stdout "OK." lines for per-file updates.
 *
 * Body: { source: string, destination: string, password?: string }
 * Returns: { jobId: string }
 */

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";

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
  const { source, destination, password } = body ?? {};

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

  if (password !== undefined && typeof password !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "password must be a string",
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

  const totalFiles = getArchiveFileCount(absSrc);
  initJobStore();
  const jobId = randomUUID();

  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: absSrc.split("/").pop() ?? absSrc,
    mode: "extract",
    sources: [absSrc],
    destination: absDest,
    total: totalFiles,
    done: 0,
    status: "running",
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  });

  // Fire-and-forget
  runExtract(jobId, absSrc, absDest, !destExisted, password || undefined).catch(
    (err) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job && job.status !== "error") {
        job.status = "error";
        job.error = String(err?.message ?? err);
        job.finishedAt = new Date().toISOString();
      }
    },
  );

  return { jobId };
});

// ── Extraction helpers ────────────────────────────────────────────────────────

/**
 * Use lsar to count entries in the archive for progress tracking.
 * Returns 1 if lsar is unavailable or the archive cannot be listed.
 */
function getArchiveFileCount(archivePath: string): number {
  try {
    const result = spawnSync("lsar", ["-j", archivePath], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    if (result.status === 0 && result.stdout) {
      const data = JSON.parse(result.stdout.trim());
      // lsar -j: { lsarFormatName: "...", lsarContents: [...] }  or plain array
      const contents: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.lsarContents)
          ? data.lsarContents
          : [];
      return Math.max(1, contents.length);
    }
  } catch {
    /* lsar not available or JSON parse error — fall through */
  }
  return 1;
}

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
  password?: string,
): Promise<void> {
  await extractWithUnar(jobId, src, dest, destCreatedByUs, password);
}

/** Extract any archive using unar with per-file progress tracking. */
function extractWithUnar(
  jobId: string,
  src: string,
  dest: string,
  destCreatedByUs: boolean,
  password?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // -o: output directory  -f: force overwrite  (no -q so we capture "OK." lines)
    const args = [src, "-o", dest, "-f"];
    if (password) {
      args.push("-p", password);
    }

    const child = spawn("unar", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Each successfully extracted file ends with "  OK." — count for progress
      const extracted = (text.match(/ OK\./g) ?? []).length;
      if (extracted > 0) {
        const job = globalThis.__transferJobs.get(jobId);
        if (job) {
          job.done = Math.min(job.done + extracted, job.total);
        }
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        const job = globalThis.__transferJobs.get(jobId);
        if (job) {
          job.done = job.total;
          job.status = "done";
          job.finishedAt = new Date().toISOString();
        }
        resolve();
        return;
      }

      // Detect wrong/missing password errors
      const combined = stdout + stderr;
      let rawMessage: string;
      if (
        combined.includes("No files extracted") ||
        combined.includes("Opening file failed") ||
        combined.includes("Wrong password") ||
        combined.includes("Encrypted")
      ) {
        rawMessage = "Wrong or missing password";
      } else {
        rawMessage = (
          stderr ||
          stdout ||
          `unar exited with code ${code}`
        ).trim();
      }

      const job = globalThis.__transferJobs.get(jobId);
      if (job) {
        job.status = "error";
        job.error = rawMessage;
        job.finishedAt = new Date().toISOString();
      }
      if (destCreatedByUs) tryCleanup(dest);
      reject(new Error(rawMessage));
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
