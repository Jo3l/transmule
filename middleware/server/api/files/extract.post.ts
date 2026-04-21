/**
 * POST /api/files/extract
 *
 * Starts a background extraction job for a compressed archive.
 * Returns a jobId immediately; actual work runs fire-and-forget in the same process.
 *
 * Extraction strategy: unar CLI only.
 *
 * Body: { source: string, destination: string }
 * Returns: { jobId: string }
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
  await extractWithUnar(jobId, src, dest, destCreatedByUs);
}

/** Extract any archive using unar (RAR3/RAR5, ZIP, 7z, tar.*, gz, bz2, xz…). */
function extractWithUnar(
  jobId: string,
  src: string,
  dest: string,
  destCreatedByUs: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // -o: output directory  -f: force overwrite  -q: quiet (no progress bar)
    const args = [src, "-o", dest, "-f", "-q"];
    const child = spawn("unar", args, {
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

      const rawMessage = (
        stderr ||
        stdout ||
        `unar exited with code ${code}`
      ).trim();

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
