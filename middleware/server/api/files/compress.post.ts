/**
 * POST /api/files/compress
 *
 * Starts a background compression job.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { resolveVirtualPath } from "../../utils/remoteMounts";
import { getDownloadsRoot } from "../../utils/files";

const VALID_FORMATS = ["zip", "tar", "tar.gz", "tar.bz2", "tar.xz"] as const;
type CompressFormat = (typeof VALID_FORMATS)[number];

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create a compressed archive (background job)",
    responses: { 200: { description: "Job started" }, 400: { description: "Invalid" }, 503: { description: "Not configured" } },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { sources, destination, archiveName, format, password } = body ?? {};

  if (!Array.isArray(sources) || !sources.length || destination === undefined || destination === null ||
      typeof archiveName !== "string" || !archiveName || !VALID_FORMATS.includes(format)) {
    throw createError({ statusCode: 400, statusMessage: "sources[], destination, archiveName and format are required" });
  }

  const root = getDownloadsRoot();
  const destRel = String(destination);
  const destPath = resolveVirtualPath(destRel) || root;

  const absSources = (sources as string[]).map((s) => resolveVirtualPath(s) || join(root, s));

  if (!existsSync(destPath)) {
    try { mkdirSync(destPath, { recursive: true }); } catch {
      throw createError({ statusCode: 400, statusMessage: "Cannot create destination directory" });
    }
  }

  const ext = format === "tar" ? ".tar" : format === "tar.gz" ? ".tar.gz" : format === "tar.bz2" ? ".tar.bz2" : format === "tar.xz" ? ".tar.xz" : `.${format}`;
  const normalizedName = (archiveName as string).toLowerCase().endsWith(ext) ? (archiveName as string) : archiveName + ext;
  const archivePath = join(destPath, normalizedName);

  const commonParent = dirname(absSources[0]!);
  const relNames = absSources.map((s) => basename(s));

  initJobStore();
  const jobId = randomUUID();

  globalThis.__transferJobs.set(jobId, {
    id: jobId, name: normalizedName, mode: "compress",
    sources: absSources, destination: archivePath,
    total: 1, done: 0, status: "running",
    queuedAt: new Date().toISOString(), startedAt: new Date().toISOString(),
  });

  runCompress(jobId, commonParent, relNames, archivePath, format as CompressFormat,
    typeof password === "string" && password.length > 0 ? password : undefined)
    .catch((err) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job) { job.status = "error"; job.error = String(err?.message ?? err); job.finishedAt = new Date().toISOString(); }
    });

  return { jobId };
});

function runCompress(jobId: string, cwd: string, relNames: string[], archivePath: string, format: CompressFormat, password?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string; let args: string[];
    if (format === "zip") { cmd = "zip"; args = password ? ["-P", password, "-r", "-q", archivePath, ...relNames] : ["-r", "-q", archivePath, ...relNames]; }
    else { const cf = format === "tar.gz" ? "-z" : format === "tar.bz2" ? "-j" : format === "tar.xz" ? "-J" : ""; cmd = "tar"; args = [`-c${cf}f`, archivePath, ...relNames]; }

    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (!job) return resolve();
      if (code === 0) { job.done = 1; job.status = "done"; job.finishedAt = new Date().toISOString(); resolve(); }
      else { const msg = stderr.trim() || `${cmd} exited with code ${code}`; job.status = "error"; job.error = msg; job.finishedAt = new Date().toISOString(); reject(new Error(msg)); }
    });
    child.on("error", (err) => {
      const job = globalThis.__transferJobs.get(jobId);
      if (job) { job.status = "error"; job.error = err.message; job.finishedAt = new Date().toISOString(); }
      reject(err);
    });
  });
}
