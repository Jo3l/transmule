/**
 * Remote-mount utility helpers.
 *
 * Persisted in data/remote-mounts.json (relative to CWD / NITRO_MOUNTS_DIR).
 * Provider-agnostic system supporting SMB, WebDAV, and future protocols.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  IRemoteProvider,
  RemoteMountConfig,
  ProviderRegistry,
} from "./remoteProvider";

export interface RemoteMount extends RemoteMountConfig {}

// Cache of active provider instances
const providerCache = new Map<string, IRemoteProvider>();

/**
 * Legacy SMB client factory for backward compatibility
 * @deprecated Use getProvider() instead
 */
export function createSmbClient(mount: RemoteMount) {
  const provider = getProvider(mount);
  return provider;
}

function getMountsFilePath(): string {
  const base = process.env.NITRO_MOUNTS_DIR || join(process.cwd(), "data");
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
  }
  return join(base, "remote-mounts.json");
}

export function loadMounts(): RemoteMount[] {
  const file = getMountsFilePath();
  if (!existsSync(file)) return [];
  try {
    const data = readFileSync(file, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveMounts(mounts: RemoteMount[]) {
  const file = getMountsFilePath();
  writeFileSync(file, JSON.stringify(mounts, null, 2));
}

export function getMountById(id: string): RemoteMount | undefined {
  return loadMounts().find((m) => m.id === id);
}

export function getMountByName(name: string): RemoteMount | undefined {
  return loadMounts().find((m) => m.name === name);
}

/**
 * Get or create a provider instance for a mount
 */
export function getProvider(mount: RemoteMount): IRemoteProvider {
  // Check cache
  const cached = providerCache.get(mount.id);
  if (cached) {
    return cached;
  }

  // Create new provider
  const provider = ProviderRegistry.createProvider(mount);
  providerCache.set(mount.id, provider);
  return provider;
}

/**
 * Clear provider from cache (e.g., on unmount)
 */
export async function removeProvider(mountId: string): Promise<void> {
  const provider = providerCache.get(mountId);
  if (provider) {
    try {
      await provider.disconnect();
    } catch {
      /* ignore */
    }
    providerCache.delete(mountId);
  }
}

/**
 * Wrap an promise with a timeout (in ms).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out")), ms),
    ),
  ]);
}

/**
 * Sanitize a remote sub-path to prevent path traversal.
 * Removes empty segments, '.' and '..' so crafted paths can't escape the share.
 */
export function sanitizeRemotePath(raw: string, isWebdav = false): string {
  if (isWebdav) {
    return raw
      .replace(/\\/g, "/")
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s && s !== "." && s !== "..")
      .join("/");
  }
  
  return raw
    .replace(/\//g, "\\")
    .split("\\")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join("\\");
}

/**
 * Build the absolute remote path for a mount + subPath.
 */
export function buildRemotePath(mount: RemoteMount, subPath: string): string {
  const isWebdav = mount.type === "webdav";
  const base = mount.path ? sanitizeRemotePath(mount.path, isWebdav) : "";
  const cleanSub = sanitizeRemotePath(subPath, isWebdav);
  
  if (isWebdav) {
    if (base && cleanSub) return `${base}/${cleanSub}`;
    return base || cleanSub;
  } else {
    // SMB
    if (base && cleanSub) return `${base}\\${cleanSub}`;
    return base || cleanSub;
  }
}

/**
 * Given a relative path inside downloads, check if it starts with a mount name.
 * Returns { mount, relativePath } if inside a mount, otherwise null.
 */
export function resolveMountPath(
  relPath: string,
): { mount: RemoteMount; subPath: string } | null {
  const mounts = loadMounts();
  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return null;
  const firstSeg = clean.split("/")[0];
  const mount = mounts.find((m) => m.name === firstSeg);
  if (!mount) return null;
  const subPath = sanitizeRemotePath(clean.slice(firstSeg.length), mount.type === "webdav");
  return { mount, subPath };
}

/**
 * Returns true if the given relative path is exactly a mount name (root of mount).
 */
export function isMountRoot(relPath: string): boolean {
  const clean = relPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/$/, "");
  if (!clean || clean.includes("/")) return false;
  return !!getMountByName(clean);
}

/**
 * Get supported provider types
 */
export function getSupportedTypes(): string[] {
  return ProviderRegistry.getSupportedTypes();
}

/**
 * Test connection to a remote mount
 */
export async function testConnection(mount: RemoteMount): Promise<boolean> {
  const provider = getProvider(mount);
  try {
    await provider.connect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Legacy functions for backward compatibility
 * @deprecated
 */
export function sanitizeSmbPath(raw: string): string {
  return sanitizeRemotePath(raw, false);
}

export async function smbRmRecursive(client: any, remotePath: string): Promise<void> {
  const stats = await client.stat(remotePath).catch(() => null);
  if (!stats) return;

  const isDir = typeof stats.isDirectory === "function" ? stats.isDirectory() : stats.isDirectory === true;

  if (isDir) {
    const children = await client.readdir(remotePath, { stats: true }).catch(() => []);
    for (const child of children) {
      const childPath = remotePath + "\\" + child.name;
      await smbRmRecursive(client, childPath);
    }
    await client.rmdir(remotePath);
  } else {
    await client.unlink(remotePath);
  }
}

export async function smbMeasureBytes(client: any, remotePath: string): Promise<number> {
  const st = await client.stat(remotePath).catch(() => null);
  if (!st) return 0;

  const isDir = typeof st.isDirectory === "function" ? st.isDirectory() : st.isDirectory === true;

  if (isDir) {
    const children = await client.readdir(remotePath, { stats: true }).catch(() => []);
    let total = 0;
    for (const child of children) {
      total += await smbMeasureBytes(client, remotePath + "\\" + child.name);
    }
    return total;
  }
  return st.size || 0;
}

export async function smbEnsureDir(client: any, remotePath: string): Promise<void> {
  const parts = remotePath.split("\\").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}\\${part}` : part;
    await client.mkdir(current).catch(() => {});
  }
}
