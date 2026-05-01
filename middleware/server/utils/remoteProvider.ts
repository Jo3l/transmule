/**
 * Remote Provider Interface
 * 
 * Abstract interface for remote storage providers (SMB, WebDAV, etc.)
 * All providers must implement this interface.
 */

import { Readable, Writable } from "node:stream";

export interface RemoteFileStats {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

export interface RemoteMountConfig {
  id: string;
  name: string;
  type: "smb" | "webdav";
  host?: string;
  share?: string;
  url?: string;
  path?: string;
  domain?: string;
  username: string;
  password: string;
}

/**
 * Interface that all remote providers must implement
 */
export interface IRemoteProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readdir(path: string): Promise<RemoteFileStats[]>;
  stat(path: string): Promise<RemoteFileStats>;
  mkdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  createReadStream(path: string): Promise<Readable & { fileSize?: number }>;
  createWriteStream(path: string, fileSize?: number): Promise<Writable>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;
  writeFile(path: string, content: string | Buffer): Promise<void>;
  isConnected(): boolean;
  /** Get disk space usage. Returns { used, available } or null if not supported */
  getQuota?(): Promise<{ used: number; available: number } | null>;
}

/**
 * Provider factory registry
 */
export class ProviderRegistry {
  private static providers = new Map<string, new (config: RemoteMountConfig) => IRemoteProvider>();

  static register(type: string, providerClass: new (config: RemoteMountConfig) => IRemoteProvider) {
    this.providers.set(type, providerClass);
  }

  static getProvider(type: string): (new (config: RemoteMountConfig) => IRemoteProvider) | undefined {
    return this.providers.get(type);
  }

  static createProvider(config: RemoteMountConfig): IRemoteProvider {
    const ProviderClass = this.providers.get(config.type);
    if (!ProviderClass) {
      throw new Error(`Unknown provider type: ${config.type}`);
    }
    return new ProviderClass(config);
  }

  static getSupportedTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}
