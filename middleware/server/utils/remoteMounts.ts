/**
 * Remote-mount configuration utilities.
 *
 * SMB/CIFS shares are configured via JSON (data/smb-mounts.json) and mounted
 * on-demand at /mnt/<name> using the native Linux mount command.
 *
 * No JavaScript SMB client — all access goes through the kernel VFS after
 * mounting.  The mounts are persistent until the user explicitly unmounts.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmdirSync,
} from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SmbMountConfig {
  id: string;
  name: string;
  host: string;
  share: string;
  /** Optional sub-path inside the share */
  path?: string;
  domain?: string;
  username: string;
  password: string;
  readOnly: boolean;
}

const MOUNT_ROOT = "/mnt";
const MOUNTS_FILE = "smb-mounts.json";
const MOUNT_TIMEOUT = 15000; // ms

// ── Config file I/O ──────────────────────────────────────────────────────────

function getConfigDir(): string {
  const base = process.env.NITRO_MOUNTS_DIR || join(process.cwd(), "data");
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
  }
  return base;
}

function getConfigPath(): string {
  return join(getConfigDir(), MOUNTS_FILE);
}

export function loadSmbConfigs(): SmbMountConfig[] {
  const file = getConfigPath();
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

export function saveSmbConfigs(configs: SmbMountConfig[]): void {
  const file = getConfigPath();
  writeFileSync(file, JSON.stringify(configs, null, 2));
}

export function getSmbConfigById(id: string): SmbMountConfig | undefined {
  return loadSmbConfigs().find((c) => c.id === id);
}

export function getSmbConfigByName(name: string): SmbMountConfig | undefined {
  return loadSmbConfigs().find((c) => c.name === name);
}

// ── Mount path helpers ───────────────────────────────────────────────────────

export function getSmbMountPath(name: string): string {
  return join(MOUNT_ROOT, name);
}

/** Escape commas in mount options (passwords etc.) */
function escapeOption(s: string): string {
  return s.replace(/,/g, "\\054");
}

// ── Mount / unmount ──────────────────────────────────────────────────────────

/**
 * Check whether a CIFS mount is currently active at /mnt/<name>.
 */
export function isSmbMounted(name: string): boolean {
  const mountPath = getSmbMountPath(name);
  try {
    execSync('mountpoint -q "' + mountPath + '"', { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mount an SMB share.  Idempotent — does nothing if already mounted.
 * Throws on failure.
 */
export async function mountSmbShare(config: SmbMountConfig): Promise<void> {
  const mountPath = getSmbMountPath(config.name);

  if (isSmbMounted(config.name)) return;

  // Create mount directory if it doesn't exist
  if (!existsSync(mountPath)) {
    mkdirSync(mountPath, { recursive: true });
  }

  const device = '//' + config.host + '/' + config.share;
  const options = [
    'username=' + escapeOption(config.username),
    'password=' + escapeOption(config.password),
    'iocharset=utf8',
    'file_mode=0755',
    'dir_mode=0755',
  ];

  if (config.domain) {
    options.push('domain=' + escapeOption(config.domain));
  }

  if (config.readOnly) {
    options.push("ro");
  } else {
    options.push("rw");
  }

  const opts = options.join(",");

  try {
    execSync(
      'mount -t cifs "' + device + '" "' + mountPath + '" -o "' + opts + '"',
      { timeout: MOUNT_TIMEOUT, stdio: "pipe" },
    );
    console.log('[smb] Mounted ' + device + ' at ' + mountPath);
  } catch (err: any) {
    const stderr = err.stderr?.toString() || err.message;
    console.error('[smb] Mount failed for ' + device + ': ' + stderr);
    throw new Error('SMB mount failed: ' + stderr);
  }
}

/**
 * Unmount an SMB share.
 */
export function unmountSmbShare(config: SmbMountConfig): void {
  const mountPath = getSmbMountPath(config.name);

  if (!isSmbMounted(config.name)) {
    try {
      if (existsSync(mountPath) && readdirSync(mountPath).length === 0) {
        rmdirSync(mountPath);
      }
    } catch { /* ignore */ }
    return;
  }

  try {
    execSync('umount "' + mountPath + '"', { timeout: 10000, stdio: "pipe" });
    console.log('[smb] Unmounted ' + mountPath);
  } catch (err: any) {
    const stderr = err.stderr?.toString() || err.message;
    console.error('[smb] Unmount failed for ' + mountPath + ': ' + stderr);
    try {
      execSync('umount -l "' + mountPath + '"', { timeout: 5000, stdio: "pipe" });
    } catch { /* ignore */ }
  }

  try {
    if (existsSync(mountPath) && readdirSync(mountPath).length === 0) {
      rmdirSync(mountPath);
    }
  } catch { /* ignore */ }
}

/**
 * Ensure a share is mounted, mounting it if needed.
 */
export async function ensureSmbMounted(config: SmbMountConfig): Promise<void> {
  if (!isSmbMounted(config.name)) {
    await mountSmbShare(config);
  }
}

// ── Path resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a relative virtual path to an absolute filesystem path.
 *
 * Virtual path layout:
 *   ""                      → virtual root (no real path)
 *   "downloads"             → NITRO_DOWNLOADS_DIR
 *   "downloads/sub/dir"     → NITRO_DOWNLOADS_DIR/sub/dir
 *   "<mount-name>"          → /mnt/<mount-name>  (auto-mounts)
 *   "<mount-name>/sub"      → /mnt/<mount-name>/sub
 *
 * Returns null for virtual root.
 */
export function resolveVirtualPath(relPath: string): string | null {
  const clean = decodeURIComponent(String(relPath || ""))
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/$/, "");

  if (!clean) return null;

  const slashIdx = clean.indexOf("/");
  const first = slashIdx === -1 ? clean : clean.slice(0, slashIdx);
  const rest = slashIdx === -1 ? "" : clean.slice(slashIdx + 1);

  if (first === "downloads") {
    const root = internalGetDownloadsRoot();
    return rest ? join(root, rest) : root;
  }

  // Check if it's a mount name
  const cfg = getSmbConfigByName(first);
  if (cfg) {
    const base = getSmbMountPath(first);
    return rest ? join(base, rest) : base;
  }

  // Fallback: treat as relative to downloads root
  const root = internalGetDownloadsRoot();
  return join(root, clean);
}

/**
 * Resolve a path that may be inside a mount, ensuring the mount is active.
 * Returns the real filesystem path, or null if not under a known mount.
 */
export async function resolveWithMount(relPath: string): Promise<string | null> {
  const clean = decodeURIComponent(String(relPath || ""))
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/$/, "");

  if (!clean) return null;

  const slashIdx = clean.indexOf("/");
  const first = slashIdx === -1 ? clean : clean.slice(0, slashIdx);

  const cfg = getSmbConfigByName(first);
  if (!cfg) return null;

  await ensureSmbMounted(cfg);
  const rest = slashIdx === -1 ? "" : clean.slice(slashIdx + 1);
  const base = getSmbMountPath(first);
  return rest ? join(base, rest) : base;
}

// ── Downloads root (internal) ──────────────────────────────────────────────

function getDownloadsDir(): string {
  return (process.env.NITRO_DOWNLOADS_DIR || "").trim();
}

/** Internal use — callers should use getDownloadsRoot from ~/utils/files */
export function internalGetDownloadsRoot(): string {
  const dir = getDownloadsDir();
  if (!dir) {
    throw createError({
      statusCode: 503,
      statusMessage: "Downloads directory not configured (set NITRO_DOWNLOADS_DIR)",
    });
  }
  return dir;
}

// ── Virtual root listing ─────────────────────────────────────────────────────

export interface VirtualRootEntry {
  name: string;
  type: "directory";
  isRemoteMount?: boolean;
  mountConfig?: SmbMountConfig;
}

export function getVirtualRootEntries(): VirtualRootEntry[] {
  const entries: VirtualRootEntry[] = [
    { name: "downloads", type: "directory", isRemoteMount: false },
  ];

  for (const cfg of loadSmbConfigs()) {
    entries.push({
      name: cfg.name,
      type: "directory",
      isRemoteMount: true,
      mountConfig: cfg,
    });
  }

  entries.sort((a, b) => {
    if (a.name === "downloads") return -1;
    if (b.name === "downloads") return 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

// ── Legacy compatibility stubs ──────────────────────────────────────────────

export function resolveMountPath(_relPath: string): null {
  return null;
}

export function isMountRoot(_relPath: string): boolean {
  return false;
}

export function loadMounts(): any[] {
  return loadSmbConfigs();
}
