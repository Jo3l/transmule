/**
 * POST /api/files/compress
 *
 * Starts a background compression job.
 * Returns a jobId immediately; actual work runs fire-and-forget in the same process.
 *
 * Supported formats: zip, 7z  → uses node-7z + bundled 7zip-bin binary
 *                    tar.gz, tar.bz2, tar.xz → uses `tar` CLI
 *
 * Body: {
 *   sources: string[],       // relative paths within downloads root
 *   destination: string,     // relative path to output folder
 *   archiveName: string,     // desired archive filename (without or with extension)
 *   format: "zip" | "7z" | "tar.gz" | "tar.bz2" | "tar.xz"
 * }
 * Returns: { jobId: string }
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, basename, dirname } from "node:path";
import sevenBin from "7zip-bin";

const VALID_FORMATS = ["zip", "7z", "tar.gz", "tar.bz2", "tar.xz"] as const;
type CompressFormat = (typeof VALID_FORMATS)[number];

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create a compressed archive from selected items (background job)",
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
  const { sources, destination, archiveName, format } = body ?? {};

  if (
    !Array.isArray(sources) ||
    !sources.length ||
    destination === undefined ||
    destination === null ||
    typeof archiveName !== "string" ||
    !archiveName ||
    !VALID_FORMATS.includes(format)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "sources[], destination, archiveName and format are required",
    });
  }

  const root = getDownloadsRoot();
  const absDest =
    typeof destination === "string" && destination !== ""
      ? resolveSafe(root, destination as string)
      : root;
  const absSources = (sources as string[]).map((s) => resolveSafe(root, s));

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

  // Build the output archive path (append extension if not already present)
  const ext =
    format === "tar.gz"
      ? ".tar.gz"
      : format === "tar.bz2"
        ? ".tar.bz2"
        : format === "tar.xz"
          ? ".tar.xz"
          : `.${format}`;
  const normalizedName = (archiveName as string).toLowerCase().endsWith(ext)
    ? (archiveName as string)
    : archiveName + ext;
  const archivePath = join(absDest, normalizedName);

  // All sources are expected to be siblings (same parent dir).
  // Build relative names from that common parent to avoid absolute paths in archive.
  const commonParent = dirname(absSources[0]!);
  const relNames = absSources.map((s) => basename(s));

  initJobStore();
  const jobId = randomUUID();

  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: normalizedName,
    mode: "compress",
    sources: absSources,
    destination: archivePath, // store archive path so UI can display it
    total: 1,
    done: 0,
    status: "running",
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  });

  // Fire-and-forget
  runCompress(
    jobId,
    commonParent,
    relNames,
    archivePath,
    format as CompressFormat,
  ).catch((err) => {
    const job = globalThis.__transferJobs.get(jobId);
    if (job) {
      job.status = "error";
      job.error = String(err?.message ?? err);
      job.finishedAt = new Date().toISOString();
    }
  });

  return { jobId };
});

function runCompress(
  jobId: string,
  cwd: string,
  relNames: string[],
  archivePath: string,
  format: CompressFormat,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    let args: string[];

    if (format === "zip" || format === "7z") {
      const typeFlag = format === "zip" ? "-tzip" : "-t7z";
      cmd = sevenBin.path7za;
      args = ["a", typeFlag, archivePath, ...relNames];
    } else {
      // tar formats
      const compressionFlag =
        format === "tar.gz" ? "-z" : format === "tar.bz2" ? "-j" : "-J"; // tar.xz
      cmd = "tar";
      args = [`-c${compressionFlag}f`, archivePath, ...relNames];
    }

    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (!job) return resolve();

      if (code === 0) {
        job.done = 1;
        job.status = "done";
        job.finishedAt = new Date().toISOString();
        resolve();
      } else {
        const msg = stderr.trim() || `${cmd} exited with code ${code}`;
        job.status = "error";
        job.error = msg;
        job.finishedAt = new Date().toISOString();
        reject(new Error(msg));
      }
    });

    child.on("error", (err) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job) {
        job.status = "error";
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
      }
      reject(err);
    });
  });
}
