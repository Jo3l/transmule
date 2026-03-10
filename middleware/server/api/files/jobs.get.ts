/**
 * GET /api/files/jobs
 *
 * Returns all active (queued/running) background jobs plus any jobs that
 * finished within the last 10 minutes.  Used by the frontend on page load
 * to rediscover backend-managed transfer jobs without relying on localStorage.
 */

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "List background file-operation jobs",
    responses: {
      200: { description: "Array of job summaries" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  initJobStore();

  const TEN_MINUTES = 10 * 60 * 1000;
  const now = Date.now();

  const result = [];

  for (const job of globalThis.__transferJobs.values()) {
    const isActive = job.status === "queued" || job.status === "running";
    const isRecent =
      job.finishedAt && now - new Date(job.finishedAt).getTime() < TEN_MINUTES;

    if (!isActive && !isRecent) continue;

    const bytesTotal = job.bytesTotal ?? 0;
    const bytesDone = job.bytesDone ?? 0;
    const percent =
      bytesTotal > 0
        ? Math.round((bytesDone / bytesTotal) * 100)
        : job.total > 0
          ? Math.round((job.done / job.total) * 100)
          : 0;

    result.push({
      jobId: job.id,
      name: job.name,
      mode: job.mode,
      percent,
      bytesTotal,
      bytesDone,
      status: job.status,
      error: job.error,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    });
  }

  return result;
});
