/**
 * POST /api/files/transfer
 *
 * Starts a background move or copy job.
 * Returns a jobId immediately; the actual work runs as a fire-and-forget
 * async task in the same process so the HTTP response returns instantly.
 *
 * Body: { sources: string[], destination: string, mode: "move" | "copy" }
 * Returns: { jobId: string }
 */

import { rename, cp, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

// Ensure the in-process job store is initialised (declared + initialised in server/utils/files.ts).
initJobStore();

export default defineEventHandler(async (event) => {
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

  const root = getDownloadsRoot();

  // Validate all source paths
  const absSources: string[] = (sources as string[]).map((s) =>
    resolveSafe(root, s),
  );
  const absDest: string = resolveSafe(root, destination as string);

  // Destination must be a directory (or creatable)
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

  const jobId = randomUUID();

  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    mode: mode as "move" | "copy",
    sources: absSources,
    destination: absDest,
    total: absSources.length,
    done: 0,
    status: "running",
    startedAt: new Date().toISOString(),
  });

  // Fire-and-forget: run the transfer in the background without blocking the
  // HTTP response. Progress is written directly to the in-memory job map.
  runTransfer(jobId, absSources, absDest, mode as "move" | "copy").catch(
    (err) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job) {
        job.status = "error";
        job.error = String(err?.message ?? err);
        job.finishedAt = new Date().toISOString();
      }
    },
  );

  return { jobId };
});

async function runTransfer(
  jobId: string,
  sources: string[],
  dest: string,
  mode: "move" | "copy",
) {
  const job = globalThis.__transferJobs.get(jobId);
  if (!job) return;

  for (const src of sources) {
    try {
      if (!existsSync(src)) {
        job.done++;
        continue;
      }

      const target = join(dest, basename(src));

      if (mode === "move") {
        try {
          // Atomic rename — instant on same filesystem
          await rename(src, target);
        } catch {
          // Cross-device: copy then delete
          await cp(src, target, { recursive: true, force: true });
          await rm(src, { recursive: true, force: true });
        }
      } else {
        await cp(src, target, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[transfer] error processing ${src}:`, err);
    }

    job.done++;
  }

  job.done = job.total;
  job.status = "done";
  job.finishedAt = new Date().toISOString();
}
