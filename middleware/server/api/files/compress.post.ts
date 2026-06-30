/**
 * POST /api/files/compress — background compression job.
 * SMB sources are downloaded to temp first, then compressed locally.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolveVirtualPath, getDownloadsRoot, smbDownloadStream } from "../../utils/remoteMounts";

const VALID_FORMATS = ["zip", "tar", "tar.gz", "tar.bz2", "tar.xz"] as const;
type CF = (typeof VALID_FORMATS)[number];

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Create archive (background)",
    responses: { 200: {}, 400: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const { sources, destination, archiveName, format, password } = body ?? {};
  if (!Array.isArray(sources) || !sources.length || destination === undefined ||
      typeof archiveName !== "string" || !archiveName || !VALID_FORMATS.includes(format))
    throw createError({ statusCode: 400, statusMessage: "sources[], destination, archiveName and format required" });

  const root = getDownloadsRoot();
  const destRel = String(destination);
  const destResolved = resolveVirtualPath(destRel);
  const destPath = destResolved?.type === "local" ? destResolved.absPath : root;
  if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });

  const ext = format === "tar" ? ".tar" : format === "tar.gz" ? ".tar.gz"
    : format === "tar.bz2" ? ".tar.bz2" : format === "tar.xz" ? ".tar.xz" : `.${format}`;
  const normalizedName = (archiveName as string).toLowerCase().endsWith(ext)
    ? (archiveName as string) : archiveName + ext;

  initJobStore();
  const jobId = randomUUID();
  globalThis.__transferJobs.set(jobId, {
    id: jobId, name: normalizedName, mode: "compress",
    sources: sources as string[], destination: destRel,
    total: 1, done: 0, status: "running",
    queuedAt: new Date().toISOString(), startedAt: new Date().toISOString(),
  });

  runCompressJob(jobId, sources as string[], destPath, normalizedName,
    format as CF, password).catch((err) => {
    const job = globalThis.__transferJobs.get(jobId);
    if (job) { job.status = "error"; job.error = String(err?.message ?? err); job.finishedAt = new Date().toISOString(); }
  });
  return { jobId };
});

async function runCompressJob(
  jobId: string, sources: string[], destDir: string,
  archiveName: string, format: CF, password?: string,
): Promise<void> {
  const tmpDir = join(process.env.NITRO_TMP_DIR || "/tmp", "transmule-compress", jobId);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const localSources: string[] = [];
    for (const src of sources) {
      const r = resolveVirtualPath(src);
      if (!r) continue;
      if (r.type === "local") {
        localSources.push(r.absPath);
      } else {
        // Download SMB file to temp
        const fname = basename(src.replace(/\\/g, "/"));
        const localPath = join(tmpDir, fname);
        const { stream } = smbDownloadStream(r.config, r.subPath);
        const ws = createWriteStream(localPath);
        await pipeline(stream as any, ws);
        localSources.push(localPath);
      }
    }

    const archivePath = join(destDir, archiveName);
    const commonParent = dirname(localSources[0]!);
    const relNames = localSources.map((s) => basename(s));

    await new Promise<void>((resolve, reject) => {
      let cmd: string, args: string[];
      if (format === "zip") { cmd = "zip"; args = password ? ["-P", password, "-r", "-q", archivePath, ...relNames] : ["-r", "-q", archivePath, ...relNames]; }
      else { const cf = format === "tar.gz" ? "-z" : format === "tar.bz2" ? "-j" : format === "tar.xz" ? "-J" : ""; cmd = "tar"; args = [`-c${cf}f`, archivePath, ...relNames]; }
      const child = spawn(cmd, args, { cwd: commonParent, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `${cmd} exit ${code}`));
      });
      child.on("error", reject);
    });

    const job = globalThis.__transferJobs.get(jobId);
    if (job) { job.done = 1; job.status = "done"; job.finishedAt = new Date().toISOString(); }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
