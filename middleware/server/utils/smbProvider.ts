/**
 * SMB Remote Provider Implementation
 */

import SMB2 from "@marsaud/smb2";
import { Readable, Writable } from "node:stream";
import {
  IRemoteProvider,
  RemoteFileStats,
  RemoteMountConfig,
  ProviderRegistry,
} from "./remoteProvider";
import { withTimeout, sanitizeSmbPath, buildRemotePath } from "./remoteMounts";

export class SmbProvider implements IRemoteProvider {
  private client: SMB2 | null = null;
  private config: RemoteMountConfig;
  private connected = false;

  constructor(config: RemoteMountConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.client = new SMB2({
      share: `\\\\${this.config.host}\\${this.config.share}`,
      domain: this.config.domain || "",
      username: this.config.username,
      password: this.config.password,
    });

    // Test connection
    try {
      await withTimeout(this.client.readdir("", { stats: false }), 8000);
      this.connected = true;
    } catch (err) {
      this.client = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.disconnect();
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

  private getRemotePath(path: string): string {
    return buildRemotePath(this.config, path);
  }

  async readdir(path: string): Promise<RemoteFileStats[]> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const files = await withTimeout(
      (this.client! as any).readdir(remotePath, { stats: true }),
      8000,
    );

    return files.map((f: any) => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      size: f.isDirectory() ? 0 : (f.size ?? f.length ?? 0),
      modified: f.mtime || new Date(),
    }));
  }

  async stat(path: string): Promise<RemoteFileStats> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const stats = await withTimeout((this.client! as any).stat(remotePath), 8000);

    return {
      name: path.split(/[\\/]/).pop() || path,
      isDirectory: stats.isDirectory(),
      // @ts-ignore - size exists on SMB2 stat response
      size: stats.size || stats.length || 0,
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
    await withTimeout((this.client! as any).rename(oldRemote, newRemote), 8000);
  }

  async unlink(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await withTimeout((this.client! as any).unlink(remotePath), 8000);
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
    const stream = await withTimeout(
      (this.client! as any).createReadStream(remotePath),
      8000,
    );

    // Get file size if available
    let fileSize: number | undefined;
    try {
      const stats = await withTimeout((this.client! as any).stat(remotePath), 8000);
      fileSize = stats.size || stats.length;
    } catch {
      /* ignore */
    }

    (stream as any).fileSize = fileSize;
    return stream as NodeJS.ReadableStream & { fileSize?: number };
  }

  async createWriteStream(path: string, fileSize?: number): Promise<NodeJS.WritableStream> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    return (this.client! as any).createWriteStream(remotePath) as NodeJS.WritableStream;
  }

  async readFile(path: string, encoding: BufferEncoding = "utf8"): Promise<string> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    return await withTimeout(
      (this.client! as any).readFile(remotePath, { encoding }),
      8000,
    );
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await withTimeout((this.client! as any).writeFile(remotePath, content), 30000);
  }

  async getQuota(): Promise<{ used: number; available: number } | null> {
    // SMB2 protocol does not support disk space queries via @marsaud/smb2
    return null;
  }
}

// Provider registration is handled by server/plugins/remoteProviders.ts
