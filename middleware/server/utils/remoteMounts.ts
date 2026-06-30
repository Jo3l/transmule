/**
 * Remote SMB mount utilities.
 *
 * Uses `smbclient` CLI (userspace Samba client) — no kernel mount,
 * no privileges required.  Config persisted in data/smb-mounts.json.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SmbMountConfig {
  id: string;
  name: string;
  host: string;
  share: string;
  path?: string;
  domain?: string;
  username: string;
  password: string;
  readOnly: boolean;
}

export interface SmbFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string; // ISO string
}

// ── Config persistence ───────────────────────────────────────────────────────

const MOUNTS_FILE = "smb-mounts.json";

function getConfigDir(): string {
  const base = process.env.NITRO_MOUNTS_DIR || join(process.cwd(), "data");
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  return base;
}

export function loadSmbConfigs(): SmbMountConfig[] {
  const fp = join(getConfigDir(), MOUNTS_FILE);
  if (!existsSync(fp)) return [];
  try { return JSON.parse(readFileSync(fp, "utf-8")); } catch { return []; }
}

export function saveSmbConfigs(configs: SmbMountConfig[]): void {
  writeFileSync(join(getConfigDir(), MOUNTS_FILE), JSON.stringify(configs, null, 2));
}

export function getSmbConfigById(id: string): SmbMountConfig | undefined {
  return loadSmbConfigs().find((c) => c.id === id);
}

export function getSmbConfigByName(name: string): SmbMountConfig | undefined {
  return loadSmbConfigs().find((c) => c.name === name);
}

// ── smbclient helpers ────────────────────────────────────────────────────────

const SMB_TIMEOUT = 30000;

/** Build the remote path in smbclient format (backslashes) */
function smbPath(config: SmbMountConfig, subPath: string): string {
  const parts: string[] = [];
  if (config.path) parts.push(config.path.replace(/\//g, "\\"));
  const clean = subPath.replace(/\//g, "\\").replace(/^\\+/, "").replace(/\\+$/, "");
  if (clean) parts.push(clean);
  return parts.length ? "\\" + parts.join("\\") : "";
}

/** Base args for smbclient */
function smbArgs(config: SmbMountConfig): string[] {
  const share = `//${config.host}/${config.share}`;
  const creds = config.password
    ? `${config.username}%${config.password}`
    : config.username || "";
  const args = [share];
  if (config.username) args.push("-U", creds);
  if (config.domain) args.push("-W", config.domain);
  return args;
}

/** Run smbclient and return stdout */
function smbExec(config: SmbMountConfig, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [...smbArgs(config), "-c", command];
    const child = spawn("smbclient", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: SMB_TIMEOUT,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) { resolve(stdout); }
      else { reject(new Error(stderr.trim() || stdout.trim() || `smbclient exit ${code}`)); }
    });
    child.on("error", reject);
  });
}

// ── File operations ──────────────────────────────────────────────────────────

/**
 * Parse smbclient `ls` output into structured entries.
 * Format: "  name                              flags  size  date"
 */
function parseSmbLs(output: string): SmbFileEntry[] {
  const entries: SmbFileEntry[] = [];
  for (const line of output.split("\n")) {
    // Match: leading spaces, name (padded), flags, size, date
    const m = line.match(
      /^\s{2}(.+?)\s{2,}([DHNARS]+)\s+(\d+)\s{2,}(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})/
    );
    if (!m) continue;
    const name = m[1].trim();
    if (name === "." || name === "..") continue;
    const flags = m[2];
    const size = parseInt(m[3], 10) || 0;
    const dateStr = m[4];
    const modified = new Date(dateStr).toISOString();
    entries.push({
      name,
      type: flags.includes("D") ? "directory" : "file",
      size: flags.includes("D") ? 0 : size,
      modified,
    });
  }
  return entries;
}

/** List a directory on the SMB share */
export async function smbListDir(
  config: SmbMountConfig, subPath: string,
): Promise<SmbFileEntry[]> {
  const remoteDir = smbPath(config, subPath);
  const cmd = remoteDir ? `ls "${remoteDir}\\*"` : "ls";
  const out = await smbExec(config, cmd);
  return parseSmbLs(out);
}

/** Stat a single file */
export async function smbStat(
  config: SmbMountConfig, subPath: string,
): Promise<SmbFileEntry | null> {
  const parent = subPath.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
  const name = subPath.split(/[\\/]/).pop() || "";
  try {
    const entries = await smbListDir(config, parent);
    return entries.find((e) => e.name === name) || null;
  } catch {
    return null;
  }
}

/** Create directory */
export async function smbMkdir(
  config: SmbMountConfig, subPath: string,
): Promise<void> {
  const remote = smbPath(config, subPath);
  await smbExec(config, `mkdir "${remote}"`);
}

/** Delete file */
export async function smbRm(
  config: SmbMountConfig, subPath: string,
): Promise<void> {
  const remote = smbPath(config, subPath);
  await smbExec(config, `rm "${remote}"`);
}

/** Delete directory (must be empty) */
export async function smbRmdir(
  config: SmbMountConfig, subPath: string,
): Promise<void> {
  const remote = smbPath(config, subPath);
  await smbExec(config, `rmdir "${remote}"`);
}

/** Recursive delete */
export async function smbRmRecursive(
  config: SmbMountConfig, subPath: string,
): Promise<void> {
  const entries = await smbListDir(config, subPath);
  for (const e of entries) {
    const childPath = subPath ? `${subPath}/${e.name}` : e.name;
    if (e.type === "directory") {
      await smbRmRecursive(config, childPath);
    } else {
      await smbRm(config, childPath);
    }
  }
  await smbRmdir(config, subPath);
}

/** Rename */
export async function smbRename(
  config: SmbMountConfig, oldPath: string, newPath: string,
): Promise<void> {
  const oldR = smbPath(config, oldPath);
  const newR = smbPath(config, newPath);
  await smbExec(config, `rename "${oldR}" "${newR}"`);
}

/** Idle timeout: kill transfer if no data for 30 seconds */
const IDLE_TIMEOUT = 30 * 1000;

function idleKiller(kill: () => void, onActivity: (cb: () => void) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  function reset() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      kill();
    }, IDLE_TIMEOUT);
  }
  reset();
  onActivity(reset);
  return () => { if (timer) clearTimeout(timer); };
}

/**
 * Download file as a readable stream.
 * Uses smbclient `get <remote> -` (stdout) with `-E` (progress → stderr).
 * Idle timeout: 30s without data kills the transfer.
 */
export function smbDownloadStream(
  config: SmbMountConfig, subPath: string,
): { stream: Readable; destroy: () => void; fileSize?: number } {
  const remote = smbPath(config, subPath);
  const args = [...smbArgs(config), "-E", "-c", `get "${remote}" -`];
  const child = spawn("smbclient", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let fileSize: number | undefined;
  let stderr = "";

  // Idle watchdog: if no data for 5 min, kill the transfer
  const cleanup = idleKiller(
    () => child.kill(),
    (onActivity) => {
      child.stdout.on("data", onActivity);
      child.stderr.on("data", onActivity);
    },
  );
  child.on("close", cleanup);

  child.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
    const m = stderr.match(/size\s+(\d+)/);
    if (m && !fileSize) fileSize = parseInt(m[1], 10);
  });

  const stream = child.stdout as Readable;
  (stream as any).fileSize = fileSize;

  return {
    stream,
    fileSize,
    destroy: () => { cleanup(); child.kill(); },
  };
}

/**
 * Upload file from a readable stream.
 * Uses smbclient `put - <remote>` (stdin).
 */
export function smbUploadStream(
  config: SmbMountConfig, subPath: string, source: Readable,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const remote = smbPath(config, subPath);
    const args = [...smbArgs(config), "-E", "-c", `put - "${remote}"`];
    const child = spawn("smbclient", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    source.pipe(child.stdin!);

    // Idle watchdog: if no data for 5 min, kill the transfer
    const cleanup = idleKiller(
      () => child.kill(),
      (onActivity) => {
        source.on("data", onActivity);
        child.stderr.on("data", onActivity);
      },
    );
    child.on("close", cleanup);

    let stderr = "";
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Upload failed (exit ${code})`));
    });
    child.on("error", reject);
    source.on("error", (err) => { cleanup(); child.kill(); reject(err); });
  });
}

// ── Downloads root ───────────────────────────────────────────────────────────

export function getDownloadsRoot(): string {
  const dir = (process.env.NITRO_DOWNLOADS_DIR || "").trim();
  if (!dir) {
    throw createError({
      statusCode: 503,
      statusMessage: "Downloads directory not configured (set NITRO_DOWNLOADS_DIR)",
    });
  }
  return dir;
}

// ── Virtual root ─────────────────────────────────────────────────────────────

export interface VirtualRootEntry {
  name: string;
  type: "directory";
  isRemoteMount?: boolean;
  homeFolder?: boolean;
  mountConfig?: SmbMountConfig;
}

export function getVirtualRootEntries(): VirtualRootEntry[] {
  const entries: VirtualRootEntry[] = [
    { name: "home", type: "directory", isRemoteMount: false, homeFolder: true },
  ];
  for (const cfg of loadSmbConfigs()) {
    entries.push({ name: cfg.name, type: "directory", isRemoteMount: true, mountConfig: cfg });
  }
  entries.sort((a, b) => {
    if (a.name === "home") return -1;
    if (b.name === "home") return 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

// ── Path resolution ──────────────────────────────────────────────────────────

export type ResolvedPath =
  { type: "local"; absPath: string } |
  { type: "smb"; config: SmbMountConfig; subPath: string };

/** Resolve a virtual path to either a local or SMB destination */
export function resolveVirtualPath(relPath: string): ResolvedPath | null {
  const clean = decodeURIComponent(String(relPath || ""))
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/$/, "");

  if (!clean) return null;

  const slashIdx = clean.indexOf("/");
  const first = slashIdx === -1 ? clean : clean.slice(0, slashIdx);
  const rest = slashIdx === -1 ? "" : clean.slice(slashIdx + 1);

  if (first === "home") {
    const root = getDownloadsRoot();
    return { type: "local", absPath: rest ? join(root, rest) : root };
  }

  const cfg = getSmbConfigByName(first);
  if (cfg) {
    return { type: "smb", config: cfg, subPath: rest };
  }

  // Fallback: treat as downloads subpath
  const root = getDownloadsRoot();
  return { type: "local", absPath: join(root, clean) };
}

// ── Legacy stubs ─────────────────────────────────────────────────────────────

export function resolveMountPath(_relPath: string): null { return null; }
export function isMountRoot(_relPath: string): boolean { return false; }
export function loadMounts(): any[] { return loadSmbConfigs(); }
