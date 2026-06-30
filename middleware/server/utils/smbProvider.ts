/**
 * SMB Remote Provider Implementation
 *
 * Uses smb3-client (pure TypeScript SMB 3.x client for Node.js 20+).
 * Path format: "share/path/to/file" (forward slashes, share as first segment).
 */

import { Client } from "smb3-client";
import { Readable, Writable } from "node:stream";
import {
  IRemoteProvider,
  RemoteFileStats,
  RemoteMountConfig,
  ProviderRegistry,
} from "./remoteProvider";
import { withTimeout } from "./remoteMounts";

export class SmbProvider implements IRemoteProvider {
  private client: Client | null = null;
  private config: RemoteMountConfig;
  private connected = false;

  constructor(config: RemoteMountConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const smb3 = new Client({
      host: this.config.host!,
      port: 445,
      domain: this.config.domain || "",
      username: this.config.username,
      password: this.config.password,
    });

    await withTimeout(smb3.connect(), 15000);
    this.client = smb3;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Build the absolute remote path for smb3-client.
   * smb3-client expects paths like "share/path/to/file" with forward slashes
   * where the first segment is the share name.
   */
  private getRemotePath(path: string): string {
    // Build path with "/" separator and prepend share name.
    // smb3-client expects paths like "share/path/to/file" (forward slashes,
    // first segment is the share name). NEVER produce a trailing slash.
    const sanitize = (s: string) =>
      s
        .replace(/\\/g, "/")
        .split("/")
        .map((seg) => seg.trim())
        .filter((seg) => seg && seg !== "." && seg !== "..")
        .join("/");

    const base = this.config.path ? sanitize(this.config.path) : "";
    const cleanSub = sanitize(path);

    const parts: string[] = [];
    if (base) parts.push(base);
    if (cleanSub) parts.push(cleanSub);

    const relativePath = parts.join("/");
    if (!relativePath) return this.config.share;
    return `${this.config.share}/${relativePath}`;
  }

  async readdir(path: string): Promise<RemoteFileStats[]> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const dirents = await withTimeout(
      (this.client! as any).readdir(remotePath, { withFileTypes: true }),
      8000,
    );

    return (dirents as any[]).map((d: any) => ({
      name: d.name,
      isDirectory:
        typeof d.isDirectory === "function"
          ? d.isDirectory()
          : d.isDirectory === true,
      size: 0,
      modified: new Date(),
    }));
  }

  async stat(path: string): Promise<RemoteFileStats> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const stats = await withTimeout(
      (this.client! as any).stat(remotePath),
      8000,
    );

    return {
      name: path.split(/[\\/]/).pop() || path,
      isDirectory: stats.isDirectory === true,
      size: stats.size || 0,
      modified: stats.mtime || new Date(),
    };
  }

  async mkdir(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await withTimeout((this.client! as any).mkdir(remotePath), 8000);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.client) await this.connect();

    const oldRemote = this.getRemotePath(oldPath);
    const newRemote = this.getRemotePath(newPath);
    await withTimeout(
      (this.client! as any).rename(oldRemote, newRemote),
      8000,
    );
  }

  async unlink(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await withTimeout((this.client! as any).rm(remotePath), 8000);
  }

  async rmdir(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await withTimeout((this.client! as any).rmdir(remotePath), 8000);
  }

  async createReadStream(
    path: string,
  ): Promise<NodeJS.ReadableStream & { fileSize?: number }> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const stream = this.client!.createReadStream(
      remotePath,
    ) as NodeJS.ReadableStream & { fileSize?: number };

    // Get file size if available
    let fileSize: number | undefined;
    try {
      const stats = await withTimeout(
        (this.client! as any).stat(remotePath),
        8000,
      );
      fileSize = stats.size || 0;
    } catch {
      /* ignore */
    }

    (stream as any).fileSize = fileSize;
    return stream;
  }

  async createWriteStream(
    path: string,
    _fileSize?: number,
  ): Promise<NodeJS.WritableStream> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    return this.client!.createWriteStream(
      remotePath,
    ) as NodeJS.WritableStream;
  }

  async readFile(
    path: string,
    encoding: BufferEncoding = "utf8",
  ): Promise<string> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const result = await withTimeout(
      (this.client! as any).readFile(remotePath, encoding),
      8000,
    );

    // smb3-client readFile returns Buffer by default, or string with encoding
    if (typeof result === "string") return result;
    return (result as Buffer).toString(encoding);
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const data = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf8");

    // smb3-client writeFile handles create/overwrite internally
    await withTimeout(
      (this.client! as any).writeFile(remotePath, data),
      1800000, // 30 min for very large files (>10GB)
    );
  }

  async getQuota(): Promise<{ used: number; available: number } | null> {
    // SMB3/2 protocol does not support disk space queries via this client
    return null;
  }
}
