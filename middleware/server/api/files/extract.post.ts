/**
 * POST /api/files/extract
 *
 * Starts a background extraction job for a compressed archive.
 * Returns a jobId immediately; actual work runs fire-and-forget in the same process.
 *
 * - RAR files        → node-unrar-js  (pure WASM, no system binary needed)
 * - Everything else  → node-7z + bundled 7zip-bin binary (zip, 7z, tar.*, gz, bz2…)
 *
 * Body: { source: string, destination: string }
 * Returns: { jobId: string }
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import { extname } from "node:path";
import Seven from "node-7z";
import sevenBin from "7zip-bin";
import { createExtractorFromFile } from "node-unrar-js";

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

function isRar(src: string): boolean {
  return extname(src).toLowerCase() === ".rar";
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
): Promise<void> {
  // 7-Zip 26.00 (installed in the Docker image) supports RAR3/RAR5 natively.
  // Use it for all formats. Fall back to node-unrar-js WASM only for .rar
  // files where 7zip reports it cannot open the archive.
  try {
    await extract7z(jobId, src, dest, destCreatedByUs);
  } catch (err7z: any) {
    if (isRar(src)) {
      // 7zip failed on this RAR — try the pure-WASM fallback.
      const job = globalThis.__transferJobs.get(jobId);
      if (job) {
        job.status = "running";
        job.error = undefined;
      }
      await extractRarWasm(jobId, src, dest, destCreatedByUs);
    } else {
      throw err7z;
    }
  }
}

/** Extract a RAR archive using node-unrar-js (pure WASM, no system binary required).
 *  Supports RAR3 and RAR5. Does NOT support multi-volume/split archives.
 */
async function extractRarWasm(
  jobId: string,
  src: string,
  dest: string,
  destCreatedByUs: boolean,
): Promise<void> {
  const job = globalThis.__transferJobs.get(jobId);
  try {
    const extractor = await createExtractorFromFile({
      filepath: src,
      targetPath: dest,
    });
    const { files } = extractor.extract();
    // Must exhaust the generator — otherwise the C++ archive handle leaks.
    for (const _ of files) {
      /* trigger extraction of each entry */
    }
    if (job) {
      job.done = 1;
      job.status = "done";
      job.finishedAt = new Date().toISOString();
    }
  } catch (err: any) {
    const reason: string = err?.reason ?? "";
    let message: string = err?.message ?? String(err);

    // Annotate known limitations so the user gets actionable feedback.
    if (reason === "ERAR_UNKNOWN_FORMAT") {
      message =
        "Unknown archive format — the file may be a multi-volume RAR (not supported) or not a valid RAR archive.";
    } else if (reason === "ERAR_MISSING_PASSWORD") {
      message = "This RAR archive is encrypted. Please provide a password.";
    }

    console.error(
      `[extract] RAR extraction failed for "${src}": ${reason} — ${message}`,
    );

    if (job) {
      job.status = "error";
      job.error = message;
      job.finishedAt = new Date().toISOString();
    }
    if (destCreatedByUs) tryCleanup(dest);
    throw err;
  }
}

/** Extract zip / 7z / tar.* / gz / bz2 using node-7z + bundled 7zip-bin binary. */
function extract7z(
  jobId: string,
  src: string,
  dest: string,
  destCreatedByUs: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = Seven.extractFull(src, dest, {
      $bin: sevenBin.path7za,
      overwrite: "a", // overwrite all existing files
    });

    stream.on("end", () => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job) {
        job.done = 1;
        job.status = "done";
        job.finishedAt = new Date().toISOString();
      }
      resolve();
    });

    stream.on("error", (err: Error) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job) {
        job.status = "error";
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
      }
      if (destCreatedByUs) tryCleanup(dest);
      reject(err);
    });
  });
}
