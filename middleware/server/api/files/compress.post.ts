/**
 * POST /api/files/compress
 *
 * Starts a background compression job.
 * Returns a jobId immediately; actual work runs fire-and-forget in the same process.
 *
 * Supported formats:
 *   - zip       → zip CLI (supports optional password via ZipCrypto)
 *   - tar, tar.gz, tar.bz2, tar.xz → tar CLI
 *
 * Body: {
 *   sources: string[],       // relative paths within downloads root
 *   destination: string,     // relative path to output folder
 *   archiveName: string,     // desired archive filename (without or with extension)
 *   format: "zip" | "tar" | "tar.gz" | "tar.bz2" | "tar.xz",
 *   password?: string        // optional password (zip only)
 * }
 * Returns: { jobId: string }
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { readFile, rename, rm } from "node:fs/promises";
import { getProvider, resolveMountPath, withTimeout, buildRemotePath } from "../../utils/remoteMounts";
import { getDownloadsRoot, resolveSafe, initJobStore } from "../../utils/files";

const VALID_FORMATS = [
  "zip",
  "tar",
  "tar.gz",
  "tar.bz2",
  "tar.xz",
] as const;
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
  const { sources, destination, archiveName, format, password } = body ?? {};

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

  // Check if any source is in a remote mount
  const remoteMountInfo = sources.map((s) => ({
    source: s,
    mountInfo: resolveMountPath(s),
  }));
  const hasRemoteSources = remoteMountInfo.some((r) => r.mountInfo !== null);
  const destMountInfo = resolveMountPath(String(destination));

  console.log(`[compress] Request:`, {
    sources,
    destination,
    archiveName,
    format,
    hasRemoteSources,
    destMountInfo: destMountInfo ? { mount: destMountInfo.mount.name, subPath: destMountInfo.subPath } : null,
    remoteSources: remoteMountInfo.map((r) => ({
      source: r.source,
      isRemote: !!r.mountInfo,
      mount: r.mountInfo?.mount.name,
    })),
  });

  // If any source or destination is remote, use SMB-aware compression
  if (hasRemoteSources || destMountInfo) {
    console.log(`[compress] Using remote compress handler`);
    return handleRemoteCompress(
      sources as string[],
      destination as string,
      archiveName as string,
      format as CompressFormat,
      typeof password === "string" && password.length > 0 ? password : undefined,
    );
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
    format === "tar"
      ? ".tar"
      : format === "tar.gz"
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
    destination: archivePath,
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
    typeof password === "string" && password.length > 0 ? password : undefined,
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
  password?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    let args: string[];

    if (format === "zip") {
      cmd = "zip";
      args = password
        ? ["-P", password, "-r", "-q", archivePath, ...relNames]
        : ["-r", "-q", archivePath, ...relNames];
    } else {
      // tar formats
      const compressionFlag =
        format === "tar.gz"
          ? "-z"
          : format === "tar.bz2"
            ? "-j"
            : format === "tar.xz"
              ? "-J"
              : "";
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

/**
 * Handle compression when sources or destination are on remote SMB mounts.
 * Strategy:
 * 1. Download all remote sources to a temp directory
 * 2. Compress locally
 * 3. If destination is remote, upload the archive
 */
async function handleRemoteCompress(
  sources: string[],
  destination: string,
  archiveName: string,
  format: CompressFormat,
  password?: string,
): Promise<{ jobId: string }> {
  initJobStore();
  const jobId = randomUUID();

  const ext =
    format === "tar"
      ? ".tar"
      : format === "tar.gz"
        ? ".tar.gz"
        : format === "tar.bz2"
          ? ".tar.bz2"
          : format === "tar.xz"
            ? ".tar.xz"
            : `.${format}`;
  const normalizedName = archiveName.toLowerCase().endsWith(ext)
    ? archiveName
    : archiveName + ext;

  globalThis.__transferJobs.set(jobId, {
    id: jobId,
    name: normalizedName,
    mode: "compress",
    sources,
    destination,
    total: sources.length + 1, // download + compress
    done: 0,
    status: "running",
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  });

  // Fire-and-forget
  runRemoteCompress(jobId, sources, destination, normalizedName, format, password).catch(
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
}

async function runRemoteCompress(
  jobId: string,
  sources: string[],
  destination: string,
  archiveName: string,
  format: CompressFormat,
  password?: string,
): Promise<void> {
  const tmpDir = join(process.env.NITRO_TMP_DIR || "/tmp", "transmule-compress", jobId);
  const destMountInfo = resolveMountPath(destination);

  console.log(`[compress] Remote compress job ${jobId}:`, {
    sources,
    destination,
    archiveName,
    format,
    destMountInfo: destMountInfo ? { mount: destMountInfo.mount.name } : null,
  });

  try {
    // Create temp directory
    mkdirSync(tmpDir, { recursive: true });

    const localSources: string[] = [];

    // Download each remote source to temp directory
    for (const source of sources) {
      const mountInfo = resolveMountPath(source);
      if (mountInfo) {
        // Remote source - download to temp
        const { mount, subPath } = mountInfo;
        const provider = getProvider(mount);
        try {
          await provider.connect();
          const remoteFilePath = buildRemotePath(mount, subPath);
          const fileName = basename(source.replace(/\\/g, "/"));
          const localPath = join(tmpDir, fileName);

          console.log(`[compress] Downloading remote file: ${remoteFilePath} -> ${localPath}`);

          const readable = await withTimeout(provider.createReadStream(subPath), 30000);
          await new Promise<void>((resolve, reject) => {
            const writeStream = createWriteStream(localPath);
            readable.pipe(writeStream);
            writeStream.on("finish", () => {
              console.log(`[compress] Downloaded: ${fileName}`);
              resolve();
            });
            writeStream.on("error", reject);
          });

          localSources.push(localPath);
          const job = globalThis.__transferJobs.get(jobId);
          if (job) job.done++;
        } catch (err: any) {
          console.error(`[compress] Failed to download ${source}:`, err);
          throw err;
        } finally {
          try {
            await provider.disconnect();
          } catch {
            /* ignore */
          }
        }
      } else {
        // Local source
        const localPath = resolveSafe(getDownloadsRoot(), source);
        console.log(`[compress] Local source: ${localPath}`);
        localSources.push(localPath);
      }
    }

    // Compress locally
    const localArchivePath = join(tmpDir, archiveName);
    const fileNames = localSources.map((s) => basename(s));
    console.log(`[compress] Compressing files:`, fileNames, `->`, archiveName);
    
    await runCompressLocal(jobId, tmpDir, fileNames, localArchivePath, format, password);
    console.log(`[compress] Compression complete: ${localArchivePath}`);

    // Upload to destination if remote
    if (destMountInfo) {
      const { mount, subPath } = destMountInfo;
      const provider = getProvider(mount);
      try {
        await provider.connect();
        const remoteArchivePath = subPath ? subPath + "/" + archiveName : archiveName;

        console.log(`[compress] Uploading to remote: ${remoteArchivePath}`);

        const fileContent = await readFile(localArchivePath);
        await withTimeout(provider.writeFile(remoteArchivePath, fileContent), 120000);
        console.log(`[compress] Upload complete`);
      } catch (err: any) {
        console.error(`[compress] Failed to upload:`, err);
        throw err;
      } finally {
        try {
          await provider.disconnect();
        } catch {
          /* ignore */
        }
      }
    } else {
      // Move to local destination
      const root = getDownloadsRoot();
      const absDest = destination
        ? resolveSafe(root, destination)
        : root;
      mkdirSync(absDest, { recursive: true });
      const finalPath = join(absDest, archiveName);
      await rename(localArchivePath, finalPath);
    }

    // Mark job as done
    const job = globalThis.__transferJobs.get(jobId);
    if (job) {
      job.done = job.total;
      job.status = "done";
      job.finishedAt = new Date().toISOString();
    }
    console.log(`[compress] Job ${jobId} completed successfully`);
  } catch (err: any) {
    console.error("[compress] Remote compress error:", err);
    const job = globalThis.__transferJobs.get(jobId);
    if (job) {
      job.status = "error";
      job.error = String(err?.message ?? err);
      job.finishedAt = new Date().toISOString();
    }
    throw err;
  } finally {
    // Cleanup temp directory
    try {
      await rm(tmpDir, { recursive: true, force: true });
      console.log(`[compress] Cleaned up temp dir: ${tmpDir}`);
    } catch {
      /* ignore */
    }
  }
}

function runCompressLocal(
  jobId: string,
  cwd: string,
  relNames: string[],
  archivePath: string,
  format: CompressFormat,
  password?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    let args: string[];

    if (format === "zip") {
      cmd = "zip";
      args = password
        ? ["-P", password, "-r", "-q", archivePath, ...relNames]
        : ["-r", "-q", archivePath, ...relNames];
    } else {
      const compressionFlag =
        format === "tar.gz"
          ? "-z"
          : format === "tar.bz2"
            ? "-j"
            : format === "tar.xz"
              ? "-J"
              : "";
      cmd = "tar";
      args = [`-c${compressionFlag}f`, archivePath, ...relNames];
    }

    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${cmd} exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}
