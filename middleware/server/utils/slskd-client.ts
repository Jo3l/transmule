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
    opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    const url = `${this.baseUrl}${path}`;
    const parsed = new URL(url);

    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: parsed.hostname,
          port: Number(parsed.port) || 5030,
          path: parsed.pathname + parsed.search,
          method: opts.method || "GET",
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
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  private async fetch(path: string, opts: { method?: string; body?: string } = {}): Promise<{ status: number; body: string }> {
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
   * Apply Soulseek credentials from the local DB to slskd's YAML config,
   * then connect to the Soulseek network.
   */
  async connect(): Promise<boolean> {
    // Sync DB-stored credentials to slskd before connecting
    const dbUser = getConfig("slskd_username");
    const dbPass = getConfig("slskd_password");
    if (dbUser && dbPass) {
      console.log(`[slskd] connect: applying DB credentials before connect — username="${dbUser}"`);
      const ok = await this.setSoulseekCredentials(dbUser, dbPass);
      console.log(`[slskd] connect: setSoulseekCredentials → ${ok ? "OK" : "FAILED"}`);
    } else {
      console.log(`[slskd] connect: no Soulseek credentials in DB, connecting with existing config`);
    }
    // Ensure the downloads directory is shared
    console.log(`[slskd] connect: ensuring shared directories`);
    const sharedOk = await this.setSharedDirectories("/downloads");
    console.log(`[slskd] connect: setSharedDirectories → ${sharedOk ? "OK" : "FAILED"}`);
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
    const res = await this.fetch(`/users/${encodeURIComponent(username)}/info`);
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  async getUserStatus(username: string): Promise<any> {
    const res = await this.fetch(`/users/${encodeURIComponent(username)}/status`);
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  }

  async browseUserFiles(username: string): Promise<any> {
    const res = await this.fetch(`/users/${encodeURIComponent(username)}/browse`);
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
      // Flatten grouped responses into individual file items
      const items: SlskdFileItem[] = [];
      let idx = 0;
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
            id: idx++,
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
    const path = direction === "download" ? "/transfers/downloads" : "/transfers/uploads";
    const res = await this.fetch(path);
    if (res.status === 200) {
      const raw: any[] = JSON.parse(res.body);
      // Flatten grouped user > directories > files into a flat transfer list
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


  async setSoulseekCredentials(username: string, password: string): Promise<boolean> {
    // Fetch current YAML config
    const getRes = await this.fetch("/options/yaml");
    if (getRes.status !== 200) return false;

    let yaml = getRes.body;

    // slskd GET /options/yaml returns the YAML as a JSON-encoded string (quoted).
    // Parse it if the response looks like a JSON value.
    if (yaml.length > 0) {
      try {
        const parsed = JSON.parse(yaml);
        if (typeof parsed === "string") {
          yaml = parsed;
          console.log(`[slskd] setSoulseekCredentials: response was JSON-encoded, decoded (len=${yaml.length})`);
        }
      } catch {
        // Not JSON — treat as raw YAML
      }
    }

    // Check if soulseek section exists in the YAML
    const hasSoulseek = /^soulseek:/m.test(yaml);

    if (hasSoulseek) {
      // Walk lines, replace ONLY username/password values in the soulseek block
      const lines = yaml.split("\n");
      const result: string[] = [];
      let inSoulseek = false;
      let insertedUser = false;
      let insertedPass = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        if (!inSoulseek && trimmed === "soulseek:") {
          inSoulseek = true;
          result.push(line);
          continue;
        }

        if (inSoulseek) {
          // Leaving the soulseek block: next top-level key (no indent)
          if (line.length > 0 && line[0] !== " " && line[0] !== "\t") {
            inSoulseek = false;
            // Insert username/password before this line if missing
            if (!insertedUser) result.push("  username: " + username);
            if (!insertedPass) result.push("  password: " + password);
            result.push(line);
            continue;
          }

          // Blank line inside the soulseek block — preserve it without exiting
          if (trimmed === "") {
            result.push(line);
            continue;
          }

          // Inside the soulseek block — replace username / password lines only
          const keyMatch = trimmed.match(/^(username|password):\s*.*$/);
          if (keyMatch) {
            const key = keyMatch[1];
            const indent = line.match(/^\s*/)?.[0] || "";
            result.push(indent + key + ": " + (key === "username" ? username : password));
            if (key === "username") insertedUser = true;
            if (key === "password") insertedPass = true;
            continue;
          }

          // Preserve any other sub-keys (address, port, search, …)
          result.push(line);
          continue;
        }

        result.push(line);
      }

      // If soulseek was the last section, append any missing fields
      if (inSoulseek) {
        if (!insertedUser) result.push("  username: " + username);
        if (!insertedPass) result.push("  password: " + password);
      }

      yaml = result.join("\n");
    } else {
      // No soulseek section — append one at the end
      yaml =
        yaml.trimEnd() +
        "\n\nsoulseek:\n  username: " +
        username +
        "\n  password: " +
        password +
        "\n";
    }

    console.log(`[slskd] setSoulseekCredentials: username="${username}", password=${password ? "[set]" : "[empty]"}`);
    console.log(`[slskd] setSoulseekCredentials: modified YAML:\n${yaml}`);

    // Save updated YAML — slskd expects a JSON-encoded string with Content-Type application/json
    const token = await this.ensureAuth();
    const authHeaders: Record<string, string> = {};
    if (token) authHeaders["authorization"] = `Bearer ${token}`;

    const putRes = await this.rawFetch("/options/yaml", {
      method: "PUT",
      body: JSON.stringify(yaml),
      headers: { "content-type": "application/json", ...authHeaders },
    });
    console.log(`[slskd] setSoulseekCredentials: PUT /options/yaml → ${putRes.status}`);
    if (putRes.status !== 200) {
      console.log(`[slskd] setSoulseekCredentials: response body (first 500 chars): ${putRes.body.slice(0, 500)}`);
    }
    return putRes.status === 200;
  }

  /**
   * Ensure a directory is added to slskd's shared directories.
   * slskd uses `shares.directories` (NOT `directories.shared`) in the YAML.
   * After updating the YAML, triggers a rescan via PUT /shares.
   */
  async setSharedDirectories(dir: string): Promise<boolean> {
    // Fetch current YAML config
    const getRes = await this.fetch("/options/yaml");
    if (getRes.status !== 200) return false;

    let yaml = getRes.body;

    // Decode if JSON-encoded
    if (yaml.length > 0) {
      try {
        const parsed = JSON.parse(yaml);
        if (typeof parsed === "string") {
          yaml = parsed;
        }
      } catch {
        /* not JSON */
      }
    }

    // Check if dir is already under shares.directories
    const alreadyShared = new RegExp(
      "^\\s*-\\s+" + dir.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "\\s*$",
      "m"
    ).test(yaml);

    if (alreadyShared) {
      console.log(`[slskd] setSharedDirectories: "${dir}" already shared`);
      return true;
    }

    // Check if shares section exists
    if (/^shares:/m.test(yaml)) {
      // Add dir under shares.directories list
      const lines = yaml.split("\n");
      const result: string[] = [];
      let inShares = false;
      let inDirectories = false;
      let inserted = false;

      for (const line of lines) {
        result.push(line);

        if (!inShares && line.trimStart() === "shares:") {
          inShares = true;
          continue;
        }

        if (inShares && !inserted) {
          const trimmed = line.trimStart();

          // Detect directories: sub-key inside shares
          if (!inDirectories && trimmed === "directories:") {
            inDirectories = true;
            continue;
          }

          // Leaving shares block: next top-level key (no indent)
          if (line.length > 0 && line[0] !== " " && line[0] !== "\t" && trimmed !== "") {
            inShares = false;
            // Insert directories before this line if not already present
            if (!inDirectories) {
              result.pop();
              result.push("  directories:");
              result.push("    - " + dir);
              result.push(line);
              inserted = true;
            }
            continue;
          }

          // Inside directories list - check if we're past the list items
          if (inDirectories) {
            const nextIsTopLevel = line.length > 0 && line[0] !== " " && line[0] !== "\t" && trimmed !== "";
            if (nextIsTopLevel) {
              inShares = false;
              inDirectories = false;
            }
          }
        }
      }

      // If we reached EOF while in shares section
      if (inShares && !inserted) {
        if (inDirectories) {
          // Append to existing directories list
          result.push("    - " + dir);
        } else {
          // Add directories sub-key
          result.push("  directories:");
          result.push("    - " + dir);
        }
        inserted = true;
      }

      if (inserted) {
        yaml = result.join("\n");
      } else {
        // Fallback: append directories to shares section
        yaml = yaml.replace(
          /^(shares:)/m,
          "$1\n  directories:\n    - " + dir
        );
      }
    } else {
      // No shares section — append at the end
      yaml =
        yaml.trimEnd() +
        "\n\nshares:\n  directories:\n    - " +
        dir +
        "\n";
    }

    // PUT updated YAML
    const token = await this.ensureAuth();
    const authHeaders: Record<string, string> = {};
    if (token) authHeaders["authorization"] = "Bearer " + token;

    const putRes = await this.rawFetch("/options/yaml", {
      method: "PUT",
      body: JSON.stringify(yaml),
      headers: { "content-type": "application/json", ...authHeaders },
    });
    console.log(`[slskd] setSharedDirectories: PUT /options/yaml → ${putRes.status}`);
    if (putRes.status !== 200) {
      console.log(`[slskd] setSharedDirectories: response body (first 500 chars): ${putRes.body.slice(0, 500)}`);
      return false;
    }

    // Trigger rescan so shares are picked up immediately
    const scanRes = await this.fetch("/shares", { method: "PUT" });
    console.log(`[slskd] setSharedDirectories: PUT /shares (rescan) → ${scanRes.status}`);
    return true;
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
