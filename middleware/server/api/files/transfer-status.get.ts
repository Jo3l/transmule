/**
 * GET /api/files/transfer-status?jobId=...
 *
 * Returns the current state of a background transfer job.
 */

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Poll background transfer job status",
    parameters: [{ name: "jobId", in: "query", required: true }],
    responses: {
      200: { description: "Job status" },
      404: { description: "Job not found" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  const { jobId } = getQuery(event);

  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }

  const job = globalThis.__transferJobs?.get(jobId as string);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" });
  }

  return {
    id: job.id,
    mode: job.mode,
    total: job.total,
    done: job.done,
    bytesTotal: job.bytesTotal ?? 0,
    bytesDone: job.bytesDone ?? 0,
    percent:
      (job.bytesTotal ?? 0) > 0
        ? Math.round(((job.bytesDone ?? 0) / job.bytesTotal!) * 100)
        : job.total > 0
          ? Math.round((job.done / job.total) * 100)
          : 0,
    status: job.status,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
});
