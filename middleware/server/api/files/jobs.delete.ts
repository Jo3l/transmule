/**
 * DELETE /api/files/jobs?jobId=...
 *
 * Cancels a queued or running background job.
 *
 * - Queued transfer: removed from __transferQueue and marked cancelled.
 * - Running transfer: AbortController is triggered, interrupting the stream copy.
 * - Extract/compress: marked cancelled (process finishes in background but status is reflected).
 */

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Cancel a background file-operation job",
    parameters: [{ name: "jobId", in: "query", required: true }],
    responses: {
      200: { description: "Job cancelled" },
      404: { description: "Job not found" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  initJobStore();

  const { jobId } = getQuery(event);

  if (!jobId || typeof jobId !== "string") {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }

  const job = globalThis.__transferJobs?.get(jobId);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" });
  }

  if (job.status === "done" || job.status === "error") {
    // Already finished — nothing to cancel, just return OK
    return { ok: true };
  }

  // Remove from queue if it hasn't started yet
  const queueIdx = globalThis.__transferQueue?.indexOf(jobId) ?? -1;
  if (queueIdx >= 0) {
    globalThis.__transferQueue.splice(queueIdx, 1);
  }

  // Abort in-progress stream copy
  globalThis.__transferAbortControllers?.get(jobId)?.abort();

  job.status = "error";
  job.error = "Cancelled";
  job.finishedAt = new Date().toISOString();

  return { ok: true };
});
