/**
 * useTransferJobs — sequential queue for move/copy background jobs.
 *
 * Each source item becomes its own job. Jobs run one at a time: a new job
 * starts only after the previous one finishes (done or error).
 *
 * State is stored in a Nuxt `useState` so all component instances share the
 * same list. `localStorage` persists queued jobs across page refresh.
 */

export interface TransferJob {
  queueId: string; // client-side UUID (always present)
  jobId?: string; // backend UUID (assigned when POST returns)
  source: string; // archive path (extract) | archive name (compress) | file path (move/copy)
  sources?: string[]; // multiple sources for compress
  destination: string;
  mode: "move" | "copy" | "extract" | "compress" | "upload";
  name: string; // display name — basename of source
  archiveName?: string; // desired archive name (compress only)
  format?: string; // compression format (compress only)
  percent: number;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

const STORAGE_KEY = "transmule-transfer-queue";

// Module-level flag: ensures only one job runs at a time even when the
// composable is instantiated from multiple components simultaneously.
let _processing = false;

// Per-job settled callbacks (not persisted — functions can't be serialized).
const _jobCallbacks = new Map<string, () => void>();

export function useTransferJobs() {
  const { apiFetch, showToast } = useApi();
  const { t } = useI18n();

  // Shared across all component instances via Nuxt's useState.
  const jobs = useState<TransferJob[]>("transferJobs", () => {
    if (import.meta.client) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as TransferJob[];
        // Jobs marked "running" when the page closed can no longer be polled
        // (the server process may have restarted). Surface them as errors.
        return saved.map((j) =>
          j.status === "running"
            ? { ...j, status: "error", error: "Interrupted by page refresh" }
            : j,
        );
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const activeJobs = computed(() =>
    jobs.value.filter((j) => j.status === "running" || j.status === "queued"),
  );
  const hasActive = computed(() => activeJobs.value.length > 0);

  // ── Persistence ────────────────────────────────────────────────────────────

  function persist() {
    if (!import.meta.client) return;
    // Only keep non-terminal jobs so done/error rows don't pile up on reload.
    const keep = jobs.value.filter((j) => j.status !== "done" && j.status !== "error");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Enqueue a single archive extraction job. */
  function enqueueExtract(source: string, destination: string, onSettled?: () => void) {
    const name = source.split("/").pop() ?? source;
    const queueId = crypto.randomUUID();
    jobs.value.push({
      queueId,
      source,
      destination,
      mode: "extract",
      name,
      percent: 0,
      status: "queued",
    });
    if (onSettled) _jobCallbacks.set(queueId, onSettled);
    persist();
    processQueue();
  }

  /** Enqueue a compression job (multiple sources → one archive). */
  function enqueueCompress(
    sources: string[],
    destination: string,
    archiveName: string,
    format: string,
    onSettled?: () => void,
  ) {
    const queueId = crypto.randomUUID();
    jobs.value.push({
      queueId,
      source: archiveName, // display label
      sources,
      destination,
      archiveName,
      format,
      mode: "compress",
      name: archiveName,
      percent: 0,
      status: "queued",
    });
    if (onSettled) _jobCallbacks.set(queueId, onSettled);
    persist();
    processQueue();
  }

  function enqueueTransfers(
    sources: string[],
    destination: string,
    mode: "move" | "copy",
    onSettled?: () => void,
  ) {
    for (const src of sources) {
      const name = src.split("/").pop() ?? src;
      const queueId = crypto.randomUUID();
      jobs.value.push({
        queueId,
        source: src,
        destination,
        mode,
        name,
        percent: 0,
        status: "queued",
      });
      if (onSettled) _jobCallbacks.set(queueId, onSettled);
    }
    persist();
    processQueue();
  }

  /** Remove jobs that are already done or errored from the visible list. */
  function clearDone() {
    jobs.value = jobs.value.filter((j) => j.status !== "done" && j.status !== "error");
    persist();
  }

  // ── Internal queue machinery ───────────────────────────────────────────────

  async function processQueue() {
    if (_processing) return;
    const next = jobs.value.find((j) => j.status === "queued");
    if (!next) return;

    _processing = true;
    next.status = "running";
    next.startedAt = new Date().toISOString();
    persist();

    try {
      let res: { jobId: string };

      if (next.mode === "extract") {
        res = await apiFetch<{ jobId: string }>("/api/files/extract", {
          method: "POST",
          body: { source: next.source, destination: next.destination },
        });
      } else if (next.mode === "compress") {
        res = await apiFetch<{ jobId: string }>("/api/files/compress", {
          method: "POST",
          body: {
            sources: next.sources ?? [next.source],
            destination: next.destination,
            archiveName: next.archiveName,
            format: next.format,
          },
        });
      } else {
        res = await apiFetch<{ jobId: string }>("/api/files/transfer", {
          method: "POST",
          body: {
            sources: [next.source],
            destination: next.destination,
            mode: next.mode,
          },
        });
      }

      next.jobId = res.jobId;
      await pollUntilDone(next);
    } catch (err: any) {
      next.status = "error";
      next.error = err?.data?.statusMessage ?? String(err);
      next.finishedAt = new Date().toISOString();
      showToast(t("fileManager.transferError", { error: next.error ?? "" }), "error");
      persist();
      _jobCallbacks.get(next.queueId)?.();
      _jobCallbacks.delete(next.queueId);
    }

    _processing = false;
    processQueue(); // start next item in queue
  }

  function pollUntilDone(job: TransferJob): Promise<void> {
    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        if (!job.jobId) return;
        try {
          const data = await apiFetch<{
            percent: number;
            status: string;
            error?: string;
            finishedAt?: string;
          }>(`/api/files/transfer-status?jobId=${job.jobId}`);

          job.percent = data.percent;

          if (data.status === "done") {
            job.status = "done";
            job.finishedAt = data.finishedAt;
            job.percent = 100;
            clearInterval(timer);
            const doneMsg =
              job.mode === "extract"
                ? t("fileManager.extractDone")
                : job.mode === "compress"
                  ? t("fileManager.compressDone")
                  : t("fileManager.transferDone", { mode: t(`fileManager.${job.mode}`) });
            showToast(doneMsg, "success");
            persist();
            _jobCallbacks.get(job.queueId)?.();
            _jobCallbacks.delete(job.queueId);
            resolve();
          } else if (data.status === "error") {
            job.status = "error";
            job.error = data.error;
            job.finishedAt = data.finishedAt;
            clearInterval(timer);
            showToast(t("fileManager.transferError", { error: data.error ?? "" }), "error");
            persist();
            _jobCallbacks.get(job.queueId)?.();
            _jobCallbacks.delete(job.queueId);
            resolve();
          }
        } catch {
          // Server lost the job (restart, expired) — treat as done.
          job.status = "done";
          job.percent = 100;
          clearInterval(timer);
          persist();
          _jobCallbacks.get(job.queueId)?.();
          _jobCallbacks.delete(job.queueId);
          resolve();
        }
      }, 2000);
    });
  }

  // Resume any queued jobs that survived a page refresh.
  if (import.meta.client && jobs.value.some((j) => j.status === "queued")) {
    processQueue();
  }

  /** Create an upload job tracked externally via XHR progress events. */
  function addUploadJob(name: string, destination: string) {
    const queueId = crypto.randomUUID();
    jobs.value.push({
      queueId,
      source: name,
      destination,
      mode: "upload",
      name,
      percent: 0,
      status: "running",
    });
    persist();
    const job = jobs.value.find((j) => j.queueId === queueId)!;
    return {
      setPercent(p: number) {
        job.percent = p;
      },
      setDone(onSettled?: () => void) {
        job.status = "done";
        job.percent = 100;
        job.finishedAt = new Date().toISOString();
        showToast(t("fileManager.transferDone", { mode: t("fileManager.upload") }), "success");
        persist();
        onSettled?.();
      },
      setError(msg: string) {
        job.status = "error";
        job.error = msg;
        job.finishedAt = new Date().toISOString();
        showToast(msg, "error");
        persist();
      },
    };
  }

  return {
    jobs,
    activeJobs,
    hasActive,
    enqueueTransfers,
    enqueueExtract,
    enqueueCompress,
    addUploadJob,
    clearDone,
  };
}
