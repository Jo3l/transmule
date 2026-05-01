/**
 * WebDAV Remote Provider Implementation
 */

import {
  createClient,
  WebDAVClient,
  FileStat,
  ResponseDataDetailed,
} from "webdav";
import { Readable, Writable } from "node:stream";
import {
  IRemoteProvider,
  RemoteFileStats,
  RemoteMountConfig,
  ProviderRegistry,
} from "./remoteProvider";

export class WebdavProvider implements IRemoteProvider {
  private client: WebDAVClient | null = null;
  private config: RemoteMountConfig;
  private connected = false;
  private basePath: string = "";

  constructor(config: RemoteMountConfig) {
    this.config = config;
    // Extract base path from URL
    if (config.url) {
      try {
        const url = new URL(config.url);
        this.basePath = url.pathname.replace(/\/$/, "");
      } catch {
        this.basePath = "";
      }
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!this.config.url) {
      throw new Error("WebDAV URL is required");
    }

    this.client = createClient(this.config.url, {
      username: this.config.username,
      password: this.config.password,
    });

    // Test connection
    try {
      await this.client.getDirectoryContents("/", { deep: false });
      this.connected = true;
    } catch (err: any) {
      this.client = null;
      throw new Error(`WebDAV connection failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  private getRemotePath(path: string): string {
    // Normalize path separators
    const normalized = path.replace(/\\/g, "/");
    // Combine with base path
    const fullPath = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    // Clean up double slashes and leading/trailing slashes
    return fullPath.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  }

  async readdir(path: string): Promise<RemoteFileStats[]> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path) || "/";
    const contents = await (this.client! as any).getDirectoryContents(remotePath, {
      deep: false,
      details: true,
    });

    const items: FileStat[] = Array.isArray(contents)
      ? contents
      : (contents as ResponseDataDetailed<FileStat>).data;

    return items.map((item) => ({
      name: item.basename,
      isDirectory: item.type === "directory",
      size: item.type === "file" ? (item.size as number) : 0,
      modified: item.lastmod ? new Date(item.lastmod) : new Date(),
    }));
  }

  async stat(path: string): Promise<RemoteFileStats> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const stat = await (this.client! as any).stat(remotePath, { details: true });
    const data: FileStat = (stat as ResponseDataDetailed<FileStat>).data || stat;

    return {
      name: data.basename,
      isDirectory: data.type === "directory",
      size: data.type === "file" ? (data.size as number) : 0,
      modified: data.lastmod ? new Date(data.lastmod) : new Date(),
    };
  }

  async mkdir(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await (this.client! as any).createDirectory(remotePath, {
      recursive: true,
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.client) await this.connect();

    const oldRemote = this.getRemotePath(oldPath);
    const newRemote = this.getRemotePath(newPath);
    await (this.client! as any).moveFile(oldRemote, newRemote);
  }

  async unlink(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await (this.client! as any).deleteFile(remotePath);
  }

  async rmdir(path: string): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await (this.client! as any).deleteDirectory(remotePath);
  }

  async createReadStream(
    path: string,
  ): Promise<NodeJS.ReadableStream & { fileSize?: number }> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    
    // Get file size first
    let fileSize: number | undefined;
    try {
      const stat = await (this.client! as any).stat(remotePath);
      fileSize = stat.size as number | undefined;
    } catch {
      /* ignore */
    }

    // Create stream
    const stream = await (this.client! as any).getFileContents(remotePath, {
      format: "binary",
    });

    // Convert to Node stream
    const nodeStream = Readable.from(stream as ArrayBuffer);
    (nodeStream as any).fileSize = fileSize;
    return nodeStream as NodeJS.ReadableStream & { fileSize?: number };
  }

  async createWriteStream(path: string, fileSize?: number): Promise<NodeJS.WritableStream> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    
    // WebDAV doesn't support streaming writes directly, so we buffer
    const chunks: Buffer[] = [];
    
    const writable = new Writable({
      write: (chunk, _encoding, callback) => {
        chunks.push(Buffer.from(chunk));
        callback();
      },
      final: async (callback) => {
        try {
          const buffer = Buffer.concat(chunks);
          await (this.client! as any).putFileContents(remotePath, buffer, {
            overwrite: true,
          });
          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    });

    return writable;
  }

  async readFile(path: string, encoding: BufferEncoding = "utf8"): Promise<string> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    const content = await (this.client! as any).getFileContents(remotePath, {
      format: "text",
    });
    return content as string;
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    if (!this.client) await this.connect();

    const remotePath = this.getRemotePath(path);
    await (this.client! as any).putFileContents(remotePath, content, {
      overwrite: true,
    });
  }

  async getQuota(): Promise<{ used: number; available: number } | null> {
    if (!this.client) await this.connect();

    try {
      // @ts-ignore - getQuota exists on the client
      const result = await this.client.getQuota();
      if (result && typeof result.used === 'number' && typeof result.available === 'number') {
        return { used: result.used, available: result.available };
      }
      return null;
    } catch {
      return null;
    }
  }
}

// Provider registration is handled by server/plugins/remoteProviders.ts
