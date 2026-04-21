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
  password?: string; // optional password (extract or compress)
  percent: number;
  bytesTotal?: number; // total bytes to transfer (move/copy only)
  bytesDone?: number; // bytes transferred so far
  speed?: number; // bytes per second (calculated client-side)
  status: "queued" | "running" | "done" | "error";
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

const STORAGE_KEY = "transmule-transfer-queue";

function createQueueId(): string {
  const cryptoApi = (globalThis as any)?.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version 4 bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Module-level flag: ensures only one extract/compress job runs at a time.
let _processing = false;

// Tracks which jobs are currently being polled (guards against duplicate intervals on reload).
const _pollingJobs = new Set<string>();

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
        // Preserve running jobs as-is; resumeJobs() will reconnect them.
        return saved;
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
  function enqueueExtract(
    source: string,
    destination: string,
    password?: string,
    onSettled?: () => void,
  ) {
    const name = source.split("/").pop() ?? source;
    const queueId = createQueueId();
    jobs.value.push({
      queueId,
      source,
      destination,
      mode: "extract",
      name,
      password,
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
    password?: string,
    onSettled?: () => void,
  ) {
    const queueId = createQueueId();
    jobs.value.push({
      queueId,
      source: archiveName, // display label
      sources,
      destination,
      archiveName,
      format,
      password,
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
      const queueId = createQueueId();
      const job: TransferJob = {
        queueId,
        source: src,
        destination,
        mode,
        name,
        percent: 0,
        status: "queued",
      };
      jobs.value.push(job);
      if (onSettled) _jobCallbacks.set(queueId, onSettled);

      // POST immediately — the backend queues and serialises execution.
      apiFetch<{ jobId: string }>("/api/files/transfer", {
        method: "POST",
        body: { sources: [src], destination, mode },
      })
        .then((res) => {
          job.jobId = res.jobId;
          persist();
          void pollUntilDone(job);
        })
        .catch((err: any) => {
          job.status = "error";
          job.error = err?.data?.statusMessage ?? String(err);
          job.finishedAt = new Date().toISOString();
          showToast(t("fileManager.transferError", { error: job.error ?? "" }), "error");
          persist();
          _jobCallbacks.get(queueId)?.();
          _jobCallbacks.delete(queueId);
        });
    }
    persist();
  }

  /** Cancel a queued or running job. */
  async function cancelJob(job: TransferJob) {
    // Optimistically update UI immediately
    job.status = "error";
    job.error = t("fileManager.cancelled");
    job.finishedAt = new Date().toISOString();
    job.speed = 0;
    _pollingJobs.delete(job.queueId);
    persist();

    if (job.jobId) {
      try {
        await apiFetch(`/api/files/jobs?jobId=${encodeURIComponent(job.jobId)}`, {
          method: "DELETE",
        });
      } catch {
        // Best-effort — UI is already updated
      }
    }
  }

  /** Remove jobs that are already done or errored from the visible list. */
  function clearDone() {
    jobs.value = jobs.value.filter((j) => j.status !== "done" && j.status !== "error");
    persist();
  }

  // ── Internal queue machinery ───────────────────────────────────────────────

  async function processQueue() {
    if (_processing) return;
    // Transfer jobs (move/copy) are managed entirely by the backend queue.
    const next = jobs.value.find(
      (j) => j.status === "queued" && j.mode !== "move" && j.mode !== "copy",
    );
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
          body: { source: next.source, destination: next.destination, password: next.password },
        });
      } else if (next.mode === "compress") {
        res = await apiFetch<{ jobId: string }>("/api/files/compress", {
          method: "POST",
          body: {
            sources: next.sources ?? [next.source],
            destination: next.destination,
            archiveName: next.archiveName,
            format: next.format,
            password: next.password,
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
      persist(); // save jobId so a page reload can reconnect to this job
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
    // Guard: prevent duplicate polling intervals for the same job.
    if (_pollingJobs.has(job.queueId)) return Promise.resolve();
    _pollingJobs.add(job.queueId);

    const queueId = job.queueId;

    return new Promise((resolve) => {
      let prevBytesDone = job.bytesDone ?? 0;
      let prevPollTime = Date.now();

      const timer = setInterval(async () => {
        // Always resolve the live reactive proxy from the store so Vue picks up mutations.
        const liveJob = jobs.value.find((j) => j.queueId === queueId);
        if (!liveJob || !liveJob.jobId) return;
        try {
          const data = await apiFetch<{
            percent: number;
            bytesTotal?: number;
            bytesDone?: number;
            status: string;
            error?: string;
            finishedAt?: string;
          }>(`/api/files/transfer-status?jobId=${liveJob.jobId}`);

          // Reflect queued/running state from backend
          if (data.status === "queued" || data.status === "running") {
            liveJob.status = data.status as "queued" | "running";
          }

          // Byte-level progress
          const bytesDone = data.bytesDone ?? 0;
          const bytesTotal = data.bytesTotal ?? 0;
          liveJob.bytesTotal = bytesTotal;
          liveJob.bytesDone = bytesDone;
          liveJob.percent = data.percent;

          // Speed (bytes/s) from diff between polls
          const now = Date.now();
          const elapsed = (now - prevPollTime) / 1000;
          if (elapsed > 0 && data.status === "running") {
            liveJob.speed = Math.round((bytesDone - prevBytesDone) / elapsed);
          } else if (data.status === "queued") {
            liveJob.speed = 0;
          }
          prevBytesDone = bytesDone;
          prevPollTime = now;

          // Persist intermediate progress so a page reload shows current state
          if (data.status === "running") persist();

          if (data.status === "done") {
            liveJob.status = "done";
            liveJob.finishedAt = data.finishedAt;
            liveJob.percent = 100;
            liveJob.speed = 0;
            clearInterval(timer);
            _pollingJobs.delete(queueId);
            const doneMsg =
              liveJob.mode === "extract"
                ? t("fileManager.extractDone")
                : liveJob.mode === "compress"
                  ? t("fileManager.compressDone")
                  : t("fileManager.transferDone", { mode: t(`fileManager.${liveJob.mode}`) });
            showToast(doneMsg, "success");
            persist();
            _jobCallbacks.get(queueId)?.();
            _jobCallbacks.delete(queueId);
            resolve();
          } else if (data.status === "error") {
            liveJob.status = "error";
            liveJob.error = data.error;
            liveJob.finishedAt = data.finishedAt;
            liveJob.speed = 0;
            clearInterval(timer);
            _pollingJobs.delete(queueId);
            showToast(t("fileManager.transferError", { error: data.error ?? "" }), "error");
            persist();
            _jobCallbacks.get(queueId)?.();
            _jobCallbacks.delete(queueId);
            resolve();
          }
        } catch {
          // Server lost the job (restart, expired) — treat as done.
          const j = jobs.value.find((j) => j.queueId === queueId);
          if (j) {
            j.status = "done";
            j.percent = 100;
            j.speed = 0;
          }
          clearInterval(timer);
          _pollingJobs.delete(queueId);
          persist();
          _jobCallbacks.get(queueId)?.();
          _jobCallbacks.delete(queueId);
          resolve();
        }
      }, 2000);
    });
  }

  // ── Client-side init: reconnect surviving jobs then resume queue ──────────

  /**
   * Re-attach to extract/compress jobs that were running when the page was
   * last closed. Sets _processing synchronously before the first await so
   * processQueue() won't start a competing job.
   * Transfer (move/copy) jobs are handled by syncTransferJobs() instead.
   */
  async function resumeJobs() {
    const runningJobs = jobs.value.filter(
      (j) => j.status === "running" && j.jobId && j.mode !== "move" && j.mode !== "copy",
    );
    if (!runningJobs.length) return;

    _processing = true; // hold queue until we know the backend state

    for (const job of runningJobs) {
      try {
        const data = await apiFetch<{
          status: string;
          percent: number;
          bytesTotal?: number;
          bytesDone?: number;
          error?: string;
          finishedAt?: string;
        }>(`/api/files/transfer-status?jobId=${job.jobId}`);

        if (data.status === "done") {
          job.status = "done";
          job.percent = 100;
          job.finishedAt = data.finishedAt;
          persist();
        } else if (data.status === "error") {
          job.status = "error";
          job.error = data.error;
          job.finishedAt = data.finishedAt;
          persist();
        } else {
          // Backend still running — re-attach poller (does not re-POST)
          await pollUntilDone(job);
        }
      } catch {
        // Backend 404 or unreachable — server was restarted
        job.status = "error";
        job.error = t("fileManager.interruptedByRestart");
        persist();
      }
    }

    _processing = false;
    processQueue(); // continue with any queued jobs
  }

  /**
   * On page load: fetch all active transfer jobs from the backend queue and
   * re-attach polling. The backend is the single source of truth for move/copy
   * jobs, so the frontend can be reloaded freely without losing queue state.
   */
  async function syncTransferJobs() {
    try {
      const backendJobs = await apiFetch<
        Array<{
          jobId: string;
          name: string;
          mode: string;
          percent: number;
          bytesTotal: number;
          bytesDone: number;
          status: string;
          error?: string;
          startedAt?: string;
          finishedAt?: string;
        }>
      >("/api/files/jobs");

      const transferJobs = backendJobs.filter((j) => j.mode === "move" || j.mode === "copy");
      const backendIds = new Set(transferJobs.map((j) => j.jobId));

      for (const bj of transferJobs) {
        if (bj.status === "done" || bj.status === "error") continue;

        const existing = jobs.value.find((j) => j.jobId === bj.jobId);
        if (existing) {
          // Update UI state from latest backend data
          existing.status = bj.status as TransferJob["status"];
          existing.percent = bj.percent;
          existing.bytesTotal = bj.bytesTotal;
          existing.bytesDone = bj.bytesDone;
          if (!_pollingJobs.has(existing.queueId)) {
            void pollUntilDone(existing);
          }
        } else {
          // Job discovered from backend on page reload — add to UI
          const job: TransferJob = {
            queueId: bj.jobId,
            jobId: bj.jobId,
            source: "",
            destination: "",
            mode: bj.mode as "move" | "copy",
            name: bj.name,
            percent: bj.percent,
            bytesTotal: bj.bytesTotal,
            bytesDone: bj.bytesDone,
            status: bj.status as TransferJob["status"],
            startedAt: bj.startedAt,
          };
          jobs.value.push(job);
          void pollUntilDone(job);
        }
      }

      // Mark any localStorage transfer jobs no longer in the backend as interrupted
      for (const job of jobs.value) {
        if (
          (job.mode === "move" || job.mode === "copy") &&
          (job.status === "running" || job.status === "queued") &&
          job.jobId &&
          !backendIds.has(job.jobId)
        ) {
          job.status = "error";
          job.error = t("fileManager.interruptedByRestart");
        }
        // Clean up queued transfer jobs where the POST never completed (in-flight on reload)
        if ((job.mode === "move" || job.mode === "copy") && job.status === "queued" && !job.jobId) {
          job.status = "error";
          job.error = t("fileManager.interruptedByRestart");
        }
      }

      persist();
    } catch {
      // Backend unreachable — keep localStorage state as a UI fallback
    }
  }

  if (import.meta.client) {
    // Reconnect extract/compress running jobs (sets _processing synchronously).
    resumeJobs();
    // Discover all backend-managed transfer jobs (independent of client queue).
    void syncTransferJobs();
    // Start queued extract/compress jobs if the queue isn't already held.
    if (
      jobs.value.some((j) => j.status === "queued" && j.mode !== "move" && j.mode !== "copy") &&
      !_processing
    ) {
      processQueue();
    }
  }

  /** Create an upload job tracked externally via XHR progress events. */
  function addUploadJob(name: string, destination: string) {
    const queueId = createQueueId();
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
    cancelJob,
    clearDone,
  };
}
