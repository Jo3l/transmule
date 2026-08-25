/**
 * SlskdClient — HTTP client for the slskd Soulseek REST API.
 *
 * Handles session authentication (login → Bearer token → reuse).
 * API base: http://slskd:5030/api/v0
 */

import { request as httpRequest } from "node:http";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlskdServerState {
  address: string;
  port: number;
  state: string;
  username: string | null;
  messageOfTheDay: string | null;
  isConnected: boolean;
}

export interface SlskdSearch {
  id: string;
  searchText: string;
  state: string;
  fileCount: number;
  startedAt: string;
  isComplete?: boolean;
  endedAt?: string | null;
  responseCount?: number;
}

export interface SlskdSearchResponse {
  username: string;
  fileCount: number;
  lockedFileCount: number;
  hasFreeUploadSlot: boolean;
  queueLength: number;
  uploadSpeed: number;
  files: SlskdFile[];
  lockedFiles: SlskdFile[];
}

export interface SlskdFile {
  filename: string;
  size: number;
  bitRate: number | null;
  sampleRate: number | null;
  length: number | null;
  bitDepth: number | null;
  isVariableBitRate: boolean | null;
  isLocked: boolean;
}

export interface SlskdFileItem {
  id: number;
  username: string;
  filename: string;
  folder: string;
  fullFilename: string;
  size: number;
  bitRate: number | null;
  sampleRate: number | null;
  length: number | null;
  bitDepth: number | null;
  isLocked: boolean;
  hasFreeUploadSlot: boolean;
  queueLength: number;
  uploadSpeed: number;
}

export interface SlskdTransfer {
  id: number;
  filename: string;
  username: string;
  size: number | null;
  bytesTransferred: number | null;
  state: string;
  startedAt: string | null;
  endedAt: string | null;
}

// ─── Client singleton ─────────────────────────────────────────────────────────

interface AuthState {
  token: string;
  expiry: number; // ms timestamp
}

let _instance: SlskdClient | null = null;
let _auth: AuthState | null = null;

export function useSlskdClient(): SlskdClient {
  if (!_instance) {
    const config = useRuntimeConfig();
    _instance = new SlskdClient((config as any).slskdUrl || "http://slskd:5030");
  }
  return _instance;
}

// ─── Client class ─────────────────────────────────────────────────────────────

export class SlskdClient {
  private baseUrl: string;

  constructor(url: string) {
    this.baseUrl = url.replace(/\/+$/, "") + "/api/v0";
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async ensureAuth(): Promise<string | null> {
    if (_auth && Date.now() < _auth.expiry) return _auth.token;

    // ── Try credentials in order ─────────────────────────────────────────────
    //   1) Default slskd/slskd (the known default for the web UI)
    //   2) slskd_web_username / slskd_web_password (explicit override)
    //   3) slskd_username / slskd_password (Soulseek creds, in case web was changed to match)
    const fallbacks: { label: string; user: string; pass: string }[] = [
      { label: 'default ("slskd")',                             user: "slskd",                    pass: "slskd" },
      { label: "slskd_web_*",                                   user: getConfig("slskd_web_username") || "", pass: getConfig("slskd_web_password") || "" },
      { label: 'slskd_* (Soulseek)',                            user: getConfig("slskd_username") || "",     pass: getConfig("slskd_password") || "" },
    ];

    for (const attempt of fallbacks) {
      if (!attempt.user) continue;

      console.log(`[slskd] ensureAuth: trying ${attempt.label} — username="${attempt.user}", password=${attempt.pass ? "[set]" : "[empty]"}`);

      try {
        const res = await this.rawFetch("/session", {
          method: "POST",
          body: JSON.stringify({ username: attempt.user, password: attempt.pass }),
        });

        if (res.status === 200 || res.status === 201) {
          const data = JSON.parse(res.body);
          if (data?.token) {
            _auth = { token: data.token, expiry: Date.now() + 300_000 };
            console.log(`[slskd] ensureAuth: got token using ${attempt.label}, expires at ${new Date(_auth.expiry).toISOString()}`);
            return data.token;
          }
          console.warn(`[slskd] ensureAuth: ${attempt.label} returned ${res.status}, no token in response`);
        } else if (res.status === 401) {
          console.warn(`[slskd] ensureAuth: ${attempt.label} → 401 Unauthorized`);
        } else {
          console.warn(`[slskd] ensureAuth: ${attempt.label} → ${res.status}`);
        }
      } catch (err) {
        console.error(`[slskd] ensureAuth: ${attempt.label} exception:`, err);
      }
    }

    console.error("[slskd] ensureAuth: all credential attempts failed");
    _auth = null;
    return null;
  }

  private async rawFetch(
    path: string,
    opts: { method?: string; body?: string; headers?: Record<string, string>; timeout?: number } = {},
  ): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    const url = `${this.baseUrl}${path}`;
    const parsed = new URL(url);
    const timeout = opts.timeout ?? 60_000; // default 60s — Soulseek ops can be slow

    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: parsed.hostname,
          port: Number(parsed.port) || 5030,
          path: parsed.pathname + parsed.search,
          method: opts.method || "GET",
          timeout, // socket idle timeout
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": "TransMule/1.0",
            host: parsed.host,
            ...opts.headers,
          },
        },
        (res: any) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks);
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
            }
            resolve({ status: res.statusCode || 0, body: raw.toString(), headers });
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`slskd request timeout after ${timeout}ms: ${opts.method || "GET"} ${path}`));
      });
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  private async fetch(path: string, opts: { method?: string; body?: string; timeout?: number } = {}): Promise<{ status: number; body: string }> {
    const token = await this.ensureAuth();
    const headers: Record<string, string> = {};
    if (token) headers["authorization"] = `Bearer ${token}`;

    const res = await this.rawFetch(path, { ...opts, headers });

    // If 401, try re-authenticating once
    if (res.status === 401) {
      _auth = null;
      const newToken = await this.ensureAuth();
      if (newToken) {
        const retryHeaders: Record<string, string> = {};
        if (newToken) retryHeaders["authorization"] = `Bearer ${newToken}`;
        return this.rawFetch(path, { ...opts, headers: retryHeaders });
      }
    }

    return res;
  }

  // ── Server ──────────────────────────────────────────────────────────────────

  async getServer(): Promise<SlskdServerState | null> {
    const res = await this.fetch("/server");
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  /**
   * Apply all configuration to slskd and connect to the Soulseek network.
   * Each config step is applied via a single YAML roundtrip to avoid races.
   * If the YAML fetch fails, connection proceeds with existing config.
   */
  async connect(): Promise<boolean> {
    const dbUser = getConfig("slskd_username");
    const dbPass = getConfig("slskd_password");

    // Build all transforms for a single YAML roundtrip
    const transforms: { label: string; fn: (yaml: string) => string }[] = [];
    if (dbUser && dbPass) {
      transforms.push({ label: "soulseek credentials", fn: this._credentialsTransform(dbUser, dbPass) });
    }
    transforms.push({ label: "shared directories", fn: this._sharesTransform("/downloads") });
    transforms.push({ label: "permissions migration (0.26.0)", fn: this._permissionsMigrationTransform() });
    transforms.push({ label: "download destination", fn: this._destinationTransform() });

    // Fetch YAML once, chain all transforms, PUT once if anything changed
    const getRes = await this.fetch("/options/yaml", { timeout: 10_000 });
    if (getRes.status !== 200) {
      console.warn(`[slskd] connect: cannot fetch YAML config (${getRes.status}), connecting with existing config`);
    } else {
      let yaml = getRes.body;
      if (yaml.length > 0) {
        try { const parsed = JSON.parse(yaml); if (typeof parsed === "string") yaml = parsed; } catch { /* raw YAML */ }
      }

      let changed = false;
      for (const t of transforms) {
        const before = yaml;
        yaml = t.fn(yaml);
        // transform applied silently
        if (yaml !== before) changed = true;
      }

      if (changed) {
        const putRes = await this.fetch("/options/yaml", {
          method: "PUT", body: JSON.stringify(yaml), timeout: 10_000,
        });
        console.log(`[slskd] connect: PUT /options/yaml → ${putRes.status}`);
        if (putRes.status === 200) {
          const scanRes = await this.fetch("/shares", { method: "PUT" });
          console.log(`[slskd] connect: PUT /shares (rescan) → ${scanRes.status}`);
        }
      }
    }

    const res = await this.fetch("/server", { method: "PUT" });
    return res.status === 200 || res.status === 205;
  }

  async disconnect(message?: string): Promise<boolean> {
    const res = await this.fetch("/server", {
      method: "DELETE",
      body: message ? JSON.stringify(message) : undefined,
    });
    return res.status === 204;
  }

  // ── Rooms ──────────────────────────────────────────────────────────────────

  async getAvailableRooms(): Promise<any[]> {
    const res = await this.fetch("/rooms/available");
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  async getJoinedRooms(): Promise<any[]> {
    const res = await this.fetch("/rooms/joined");
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  async joinRoom(roomName: string): Promise<boolean> {
    const res = await this.fetch("/rooms/joined", {
      method: "POST",
      body: JSON.stringify(roomName), // slskd expects a raw JSON string
    });
    return res.status === 200 || res.status === 201;
  }

  async leaveRoom(roomName: string): Promise<boolean> {
    const res = await this.fetch(`/rooms/joined/${encodeURIComponent(roomName)}`, {
      method: "DELETE",
    });
    return res.status === 200 || res.status === 204;
  }

  async getRoomMessages(roomName: string): Promise<any[]> {
    const res = await this.fetch(`/rooms/joined/${encodeURIComponent(roomName)}/messages`);
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  async getRoomUsers(roomName: string): Promise<any[]> {
    const res = await this.fetch(`/rooms/joined/${encodeURIComponent(roomName)}/users`);
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  async sendRoomMessage(roomName: string, message: string): Promise<boolean> {
    const res = await this.fetch(`/rooms/joined/${encodeURIComponent(roomName)}/messages`, {
      method: "POST",
      body: JSON.stringify(message), // slskd expects a raw JSON string
    });
    return res.status === 200 || res.status === 201;
  }

  // ── Users / Conversations ─────────────────────────────────────────────────────

  async getUserInfo(username: string): Promise<any> {
    const res = await this.fetch(`/users/${encodeURIComponent(username)}/info`, { timeout: 45_000 });
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  async getUserStatus(username: string): Promise<any> {
    const res = await this.fetch(`/users/${encodeURIComponent(username)}/status`, { timeout: 45_000 });
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  async browseUserFiles(username: string): Promise<any> {
    const res = await this.fetch(`/users/${encodeURIComponent(username)}/browse`, { timeout: 120_000 });
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  async getConversationMessages(username: string): Promise<any[]> {
    const res = await this.fetch(`/conversations/${encodeURIComponent(username)}/messages`);
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  async sendConversationMessage(username: string, message: string): Promise<boolean> {
    const res = await this.fetch(`/conversations/${encodeURIComponent(username)}`, {
      method: "POST",
      body: JSON.stringify(message),
    });
    return res.status === 200 || res.status === 201;
  }

  async closeConversation(username: string): Promise<boolean> {
    const res = await this.fetch(`/conversations/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
    return res.status === 200 || res.status === 204;
  }

  async getConversations(): Promise<any[]> {
    const res = await this.fetch("/conversations");
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  // ── Searches ────────────────────────────────────────────────────────────────

  async getSearches(): Promise<SlskdSearch[]> {
    const res = await this.fetch("/searches");
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  async createSearch(id: string, searchText: string): Promise<boolean> {
    const res = await this.fetch("/searches", {
      method: "POST",
      body: JSON.stringify({ id, searchText }),
    });
    return res.status === 200 || res.status === 201;
  }

  async stopSearch(id: string): Promise<boolean> {
    const res = await this.fetch(`/searches/${encodeURIComponent(id)}`, {
      method: "PUT",
    });
    return res.status === 200 || res.status === 204;
  }

  async removeSearch(id: string): Promise<boolean> {
    const res = await this.fetch(`/searches/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.status === 200 || res.status === 204;
  }

  async getSearchResponses(id: string): Promise<SlskdFileItem[]> {
    const res = await this.fetch(`/searches/${encodeURIComponent(id)}/responses`);
    if (res.status === 200) {
      const raw: SlskdSearchResponse[] = JSON.parse(res.body);
      // Flatten grouped responses into individual file items.
      // Use a stable hash of username+filename so IDs don't change across polls.
      const items: SlskdFileItem[] = [];
      let idx = 0;
      function stableId(u: string, f: string): number {
        let h = 0;
        const s = u + "|" + f;
        for (let i = 0; i < s.length; i++) {
          h = ((h << 5) - h) + s.charCodeAt(i);
          h |= 0;
        }
        return Math.abs(h);
      }
      for (const userResp of raw) {
        // Extract folder from first file's full path (Soulseek uses \ as separator)
        const userFolder = userResp.files.length > 0
          ? (() => {
              const lastSep = userResp.files[0].filename.lastIndexOf("\\");
              // Also try forward slash for non-Windows paths
              const lastSep2 = userResp.files[0].filename.lastIndexOf("/");
              const sep = Math.max(lastSep, lastSep2);
              return sep >= 0 ? userResp.files[0].filename.substring(0, sep) : "";
            })()
          : "";

        for (const file of userResp.files) {
          // Extract just the filename (last component after \ or /)
          const lastSep = Math.max(file.filename.lastIndexOf("\\"), file.filename.lastIndexOf("/"));
          const shortName = lastSep >= 0 ? file.filename.substring(lastSep + 1) : file.filename;

          items.push({
            id: stableId(userResp.username, file.filename),
            username: userResp.username,
            filename: shortName,
            fullFilename: file.filename,
            folder: userFolder,
            size: file.size,
            bitRate: file.bitRate ?? null,
            sampleRate: file.sampleRate ?? null,
            length: file.length ?? null,
            bitDepth: file.bitDepth ?? null,
            isLocked: file.isLocked ?? false,
            hasFreeUploadSlot: userResp.hasFreeUploadSlot ?? false,
            queueLength: userResp.queueLength ?? 0,
            uploadSpeed: userResp.uploadSpeed ?? 0,
          });
        }
      }
      return items;
    }
    return [];
  }

  // ── Transfers ───────────────────────────────────────────────────────────────

  async getTransfers(direction: "download" | "upload"): Promise<SlskdTransfer[]> {
    const raw = await this.getTransfersGrouped(direction);
    const transfers: SlskdTransfer[] = [];
    for (const userGrp of raw) {
      const dirs = userGrp.directories ?? [];
      for (const dir of dirs) {
        const files = dir.files ?? [];
        for (const file of files) {
          transfers.push({
            id: file.id ?? String(file.filename),
            username: file.username ?? userGrp.username,
            filename: file.filename,
            size: file.size ?? 0,
            bytesTransferred: file.bytesTransferred ?? 0,
            bytesRemaining: file.bytesRemaining ?? 0,
            startTime: file.startedAt ?? null,
            endTime: file.endedAt ?? null,
            state: file.state ?? "Unknown",
            direction: file.direction ?? direction,
            priority: file.priority ?? 0,
            duration: file.elapsedTime ?? null,
            averageSpeed: file.averageSpeed ?? null,
            offset: file.startOffset ?? 0,
          });
        }
      }
    }
    return transfers;
  }

  /** Get transfers grouped by user and directory (raw slskd format, not flattened) */
  async getTransfersGrouped(direction: 'download' | 'upload'): Promise<any[]> {
    const path = direction === 'download' ? '/transfers/downloads' : '/transfers/uploads';
    const res = await this.fetch(path);
    if (res.status === 200) {
      const raw: any[] = JSON.parse(res.body);
      // Ensure every file has an id (slskd may omit it or return empty string).
      // Use a synthetic id as fallback — the real cancel API needs a numeric id,
      // but at least this gives the frontend a non-empty unique value to work with.
      let synthId = 0;
      for (const userGrp of raw) {
        for (const dir of (userGrp.directories ?? [])) {
          for (const file of (dir.files ?? [])) {
            if (file.id == null || file.id === '') {
              file.id = `synth-${++synthId}`;
            }
          }
        }
      }
      return raw;
    }
    return [];
  }

  async startDownload(username: string, files: { filename: string; size: number }[]): Promise<{ success: boolean; response?: string }> {
    const res = await this.fetch(`/transfers/downloads/${encodeURIComponent(username)}`, {
      method: "POST",
      body: JSON.stringify(files),
    });
    return {
      success: res.status === 200 || res.status === 201,
      response: res.status !== 200 && res.status !== 201 ? `${res.status}: ${res.body}` : undefined,
    };
  }

  /**
   * Enqueue a batch download (slskd 0.26.0+).
   * Uses the new batch API with a batch ID and options.
   * Falls back to startDownload() if the batch endpoint returns 404 (older slskd).
   */
  async enqueueDownloadBatch(
    username: string,
    files: { filename: string; size: number }[],
    opts?: { batchId?: string; searchId?: string },
  ): Promise<{ success: boolean; status: number; body?: any }> {
    const batchId = opts?.batchId || crypto.randomUUID();
    const reqBody: any = {
      id: batchId,
      username,
      files: files.map((f) => ({ filename: f.filename, size: f.size })),
    };
    if (opts?.searchId) reqBody.searchId = opts.searchId;

    const res = await this.fetch("/transfers/downloads/batches", {
      method: "POST",
      body: JSON.stringify(reqBody),
      timeout: 300_000,
    });

    // 404 means the batch endpoint doesn't exist (pre-0.26.0), fall back to old API
    if (res.status === 404) {
      const fallback = await this.startDownload(username, files);
      return { success: fallback.success, status: fallback.success ? 201 : 502 };
    }

    const isSuccess = res.status === 200 || res.status === 201 || res.status === 207;
    let parsed: any = undefined;
    try { parsed = JSON.parse(res.body); } catch {}

    return { success: isSuccess, status: res.status, body: parsed };
  }

  async cancelTransfer(
    usernameOrId: string | number,
    transferId?: string,
    direction?: string,
    remove?: boolean,
  ): Promise<boolean> {
    const qs = remove ? "?remove=true" : "";
    let path: string;
    if (transferId) {
      // New API: /transfers/{direction}s/{username}/{id}
      const dir = direction || "download";
      path = `/transfers/${dir}s/${encodeURIComponent(String(usernameOrId))}/${encodeURIComponent(String(transferId))}${qs}`;
    } else {
      // Old API: /transfers/{id}
      path = `/transfers/${encodeURIComponent(String(usernameOrId))}${qs}`;
    }
    const res = await this.fetch(path, {
      method: "DELETE",
    });
    return res.status === 200 || res.status === 204;
  }

  /** Remove all completed downloads in one call (slskd native bulk endpoint). */
  async clearCompletedDownloads(): Promise<boolean> {
    const res = await this.fetch("/transfers/downloads/all/completed", {
      method: "DELETE",
    });
    return res.status === 200 || res.status === 204;
  }

  // ── Config helpers (private transforms, chained by connect()) ──────────────

  private _credentialsTransform(dbUser: string, dbPass: string): (yaml: string) => string {
    return (yaml) => {
      const hasSoulseek = /^soulseek:/m.test(yaml);
      if (!hasSoulseek) {
        return yaml.trimEnd() + `\n\nsoulseek:\n  username: ${dbUser}\n  password: ${dbPass}\n`;
      }

      const lines = yaml.split("\n");
      const result: string[] = [];
      let inSoulseek = false;
      let insertedUser = false;
      let insertedPass = false;

      for (const line of lines) {
        const trimmed = line.trimStart();

        if (!inSoulseek && trimmed === "soulseek:") { inSoulseek = true; result.push(line); continue; }
        if (inSoulseek) {
          if (line.length > 0 && line[0] !== " " && line[0] !== "\t") {
            inSoulseek = false;
            if (!insertedUser) result.push("  username: " + dbUser);
            if (!insertedPass) result.push("  password: " + dbPass);
            result.push(line);
            continue;
          }
          if (trimmed === "") { result.push(line); continue; }
          const keyMatch = trimmed.match(/^(username|password):\s*.*$/);
          if (keyMatch) {
            const key = keyMatch[1];
            const indent = line.match(/^\s*/)?.[0] || "";
            result.push(indent + key + ": " + (key === "username" ? dbUser : dbPass));
            if (key === "username") insertedUser = true;
            if (key === "password") insertedPass = true;
            continue;
          }
          result.push(line);
          continue;
        }
        result.push(line);
      }

      if (inSoulseek) {
        if (!insertedUser) result.push("  username: " + dbUser);
        if (!insertedPass) result.push("  password: " + dbPass);
      }
      return result.join("\n");
    };
  }

  private _sharesTransform(dir: string): (yaml: string) => string {
    return (yaml) => {
      const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp("^\\s*-\\s+" + escaped + "\\s*$", "m").test(yaml)) return yaml;

      if (/^shares:/m.test(yaml)) {
        const lines = yaml.split("\n");
        const result: string[] = [];
        let inShares = false, inDirectories = false, inserted = false;

        for (const line of lines) {
          result.push(line);
          if (!inShares && line.trimStart() === "shares:") { inShares = true; continue; }
          if (inShares && !inserted) {
            const t = line.trimStart();
            if (!inDirectories && t === "directories:") { inDirectories = true; continue; }
            if (line.length > 0 && line[0] !== " " && line[0] !== "\t" && t !== "") {
              inShares = false;
              if (!inDirectories) { result.pop(); result.push("  directories:"); result.push("    - " + dir); result.push(line); inserted = true; }
              continue;
            }
          }
        }

        if (inShares && !inserted) {
          if (inDirectories) result.push("    - " + dir);
          else { result.push("  directories:"); result.push("    - " + dir); }
          inserted = true;
        }
        if (inserted) return result.join("\n");
        return yaml.replace(/^(shares:)/m, "$1\n  directories:\n    - " + dir);
      }
      return yaml.trimEnd() + `\n\nshares:\n  directories:\n    - ${dir}\n`;
    };
  }

  /**
   * Set download destination subdirectory to organize by remote username
   * and preserve the full remote directory structure.
   * Also sets exists=overwrite so already-downloaded files are replaced
   * instead of duplicated (rename is the slskd default).
   * slskd 0.26.0+ evaluates ${SOURCE_USERNAME} and ${SOURCE_PATH} at download time.
   *
   * For a file @@abcde\\Music\\Albums\\CoolAlbum\\CD1\\track01.mp3 from user Bob:
   *   /downloads/Bob/@@abcde/Music/Albums/CoolAlbum/CD1/track01.mp3
   */
  private _destinationTransform(): (yaml: string) => string {
    const subdirValue = "${SOURCE_USERNAME}/${SOURCE_PATH}";
    const existsValue = "overwrite";

    return (yaml) => {
      // Already configured with our values? Skip.
      if (yaml.includes("subdirectory: " + subdirValue) &&
          yaml.includes("exists: " + existsValue)) return yaml;

      const lines = yaml.split("\n");
      const result: string[] = [];
      let inTransfers = false;
      let inDownload = false;
      let inDestination = false;
      let insertedSubdir = false;
      let insertedExists = false;

      for (const line of lines) {
        const trimmed = line.trimStart();

        if (!inTransfers && trimmed === "transfers:") { inTransfers = true; result.push(line); continue; }
        if (inTransfers) {
          if (!inDownload && /^\s+download:/.test(line)) { inDownload = true; result.push(line); continue; }
          if (inDownload && !inDestination && /^\s+destination:/.test(line)) { inDestination = true; result.push(line); continue; }

          // Leaving the transfers block? Insert before exiting.
          if (line.length > 0 && line[0] !== " " && line[0] !== "\t") {
            if (!insertedSubdir) {
              if (!inDownload) {
                result.push("  download:");
                result.push("    destination:");
                result.push("      subdirectory: " + subdirValue);
                result.push("      exists: " + existsValue);
              } else if (!inDestination) {
                result.push("    destination:");
                result.push("      subdirectory: " + subdirValue);
                result.push("      exists: " + existsValue);
              } else {
                result.push("      subdirectory: " + subdirValue);
                result.push("      exists: " + existsValue);
              }
              insertedSubdir = true;
            }
            inTransfers = false;
            inDownload = false;
            inDestination = false;
            result.push(line);
            continue;
          }

          // Inside destination block, update existing subdirectory key
          if (inDestination && /^\s+subdirectory:/.test(line)) {
            const indent = line.match(/^\s*/)?.[0] || "";
            result.push(indent + "subdirectory: " + subdirValue);
            insertedSubdir = true;
            continue;
          }

          // Inside destination block, update existing exists key
          if (inDestination && /^\s+exists:/.test(line)) {
            const indent = line.match(/^\s*/)?.[0] || "";
            result.push(indent + "exists: " + existsValue);
            insertedExists = true;
            continue;
          }

          result.push(line);
          continue;
        }
        result.push(line);
      }

      // End of file, still inside transfers
      if (!insertedSubdir) {
        if (!inTransfers) {
          result.push("transfers:");
          result.push("  download:");
          result.push("    destination:");
          result.push("      subdirectory: " + subdirValue);
          result.push("      exists: " + existsValue);
        } else if (!inDownload) {
          result.push("  download:");
          result.push("    destination:");
          result.push("      subdirectory: " + subdirValue);
          result.push("      exists: " + existsValue);
        } else if (!inDestination) {
          result.push("    destination:");
          result.push("      subdirectory: " + subdirValue);
          result.push("      exists: " + existsValue);
        } else {
          result.push("      subdirectory: " + subdirValue);
          result.push("      exists: " + existsValue);
        }
      } else if (!insertedExists) {
        // subdirectory was inserted but exists wasn't — add it
        // Find the line where subdirectory was inserted and add exists after it
        const idx = result.findIndex(l => l.includes("subdirectory: " + subdirValue));
        if (idx >= 0) {
          const indent = result[idx].match(/^\s*/)?.[0] || "      ";
          result.splice(idx + 1, 0, indent + "exists: " + existsValue);
        }
      }

      return result.join("\n");
    };
  }

  /**
   * Migrate old permissions.file.mode to new location (slskd 0.26.0 breaking change).
   * This runs once on first connect after upgrade and is idempotent.
   */
  private _permissionsMigrationTransform(): (yaml: string) => string {
    return (yaml) => {
      // Only act if the old key still exists
      if (!/^permissions:\s*$/m.test(yaml)) return yaml;

      const modeMatch = yaml.match(/^\s+mode:\s*(.+)$/m);
      if (!modeMatch) return yaml;

      const modeValue = modeMatch[1].trim();

      // Remove old permissions block (the whole "permissions:" section)
      let result = yaml.replace(/^permissions:\s*\n(?:\s+.*\n)*/m, "");

      // Insert into new location under transfers.download.destination.permissions
      const newSection = "    permissions:\n      mode: " + modeValue;

      if (/^transfers:/m.test(result)) {
        // Add under existing transfers.download.destination if it exists
        if (/^\s+destination:/m.test(result)) {
          result = result.replace(
            /^(\s+destination:.*\n)/m,
            "$1" + newSection + "\n",
          );
        } else if (/^\s+download:/m.test(result)) {
          result = result.replace(
            /^(\s+download:.*\n)/m,
            "$1  destination:\n" + newSection + "\n",
          );
        } else {
          result = result.replace(
            /^(transfers:.*\n)/m,
            "$1  download:\n    destination:\n" + newSection + "\n",
          );
        }
      } else {
        result = result.trimEnd() + "\n\ntransfers:\n  download:\n    destination:\n" + newSection + "\n";
      }

      return result;
    };
  }

  // ── Shares (local shared files) ──────────────────────────────────────────────

  /**
   * Trigger a rescan of all shares.
   */
  async rescanShares(): Promise<boolean> {
    const res = await this.fetch("/shares", { method: "PUT" });
    return res.status === 200;
  }

  /**
   * Get local shared files/directories from slskd.
   * Returns the raw response from GET /shares.
   */
  async getShares(): Promise<any> {
    const res = await this.fetch("/shares");
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  /**
   * List files in a shared directory.
   * @param shareId - The share ID from getShares()
   * @param b64path - Base64-encoded directory path
   */
  async getShareFiles(shareId: string, b64path: string): Promise<any[]> {
    const res = await this.fetch(
      `/files/${encodeURIComponent(shareId)}/files/${encodeURIComponent(b64path)}`,
    );
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  /**
   * List subdirectories in a shared directory.
   * @param shareId - The share ID from getShares()
   * @param b64path - Base64-encoded directory path
   */
  async getShareDirectories(shareId: string, b64path: string): Promise<any[]> {
    const res = await this.fetch(
      `/files/${encodeURIComponent(shareId)}/directories/${encodeURIComponent(b64path)}`,
    );
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }

  /**
   * Get contents of a share (root or subdirectory).
   * @param shareId - The share ID from getShares()
   * @param b64path - Base64-encoded directory path (empty string for root)
   */
  async getShareContents(shareId: string, b64path: string): Promise<any[]> {
    const path = b64path
      ? `/shares/${encodeURIComponent(shareId)}/contents/${encodeURIComponent(b64path)}`
      : `/shares/${encodeURIComponent(shareId)}/contents`;
    const res = await this.fetch(path);
    if (res.status === 200) return JSON.parse(res.body);
    return [];
  }
}
