/**
 * PyLoadClient — HTTP client for the pyLoad NG download manager API.
 *
 * pyLoad exposes a REST-ish JSON API at /api/<command>.
 * GET commands accept query parameters.
 * POST commands accept application/x-www-form-urlencoded with JSON-encoded values.
 *
 * Authentication: HTTP Basic Auth (Authorization header) on every request.
 *
 * Reference implementation: https://github.com/tr4nt0r/pyloadapi
 * pyLoad NG docs:            https://pyload.net
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PyLoadStatus {
  pause: boolean;
  active: number;
  queue: number;
  total: number;
  speed: number;
  download: boolean;
  reconnect: boolean;
}

export interface PyLoadLink {
  fid: number;
  url: string;
  name: string;
  packageID: number;
  status: number;
  statusmsg: string;
  error: string;
  size: number;
  bleft: number;
  speed: number;
  plugin: string;
}

/** Real-time info from status_downloads — only present for actively running links */
export interface PyLoadActiveDownload {
  fid: number;
  name: string;
  speed: number; // bytes/s
  eta: number; // seconds
  bleft: number; // bytes left
  size: number;
  percent: number; // 0-100
  status: number;
  statusmsg: string;
  package_id: number;
  package_name: string;
  plugin: string;
}

export interface PyLoadPackage {
  pid: number;
  name: string;
  folder: string;
  site: string;
  comment: string;
  dest: number;
  fids: number[];
  links?: PyLoadLink[];
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: PyLoadClient | null = null;

export function usePyLoadClient(): PyLoadClient {
  if (!_instance) {
    const config = useRuntimeConfig();
    _instance = new PyLoadClient({
      url: config.pyloadUrl as string,
      username: config.pyloadUsername as string,
      password: config.pyloadPassword as string,
    });
  }
  return _instance;
}

// ─── Client class ─────────────────────────────────────────────────────────────

export interface PyLoadConfig {
  url: string;
  username: string;
  password: string;
}

export class PyLoadClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: PyLoadConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.username}:${config.password}`).toString("base64");
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private endpoint(command: string): string {
    return `${this.baseUrl}/api/${command}`;
  }

  private async get<T = unknown>(
    command: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(this.endpoint(command));
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `pyLoad API error: ${res.status} ${res.statusText}`,
      });
    }

    const json = await res.json();
    // pyLoad NG returns HTTP 200 with {"error": "...", "traceback": "..."} on bad calls
    if (
      json &&
      typeof json === "object" &&
      "error" in json &&
      "traceback" in json
    ) {
      throw createError({
        statusCode: 502,
        statusMessage: `pyLoad API error: ${(json as any).error}`,
      });
    }
    return json as T;
  }

  private async post<T = unknown>(
    command: string,
    data: Record<string, unknown> = {},
  ): Promise<T> {
    // pyLoad expects form-encoded data where each value is JSON-encoded
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      body.append(k, JSON.stringify(v));
    }

    const res = await fetch(this.endpoint(command), {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `pyLoad API error: ${res.status} ${res.statusText}`,
      });
    }

    // Some commands return empty body or "true"
    const text = await res.text();
    if (!text || text === "null") return null as T;
    try {
      const json = JSON.parse(text);
      // pyLoad NG returns HTTP 200 with {"error": "...", "traceback": "..."} on bad calls
      if (
        json &&
        typeof json === "object" &&
        "error" in json &&
        "traceback" in json
      ) {
        throw createError({
          statusCode: 502,
          statusMessage: `pyLoad API error: ${(json as any).error}`,
        });
      }
      return json as T;
    } catch (err) {
      if ((err as any).statusCode) throw err;
      return text as unknown as T;
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  async getStatus(): Promise<PyLoadStatus> {
    return this.get<PyLoadStatus>("status_server");
  }

  async getVersion(): Promise<string> {
    const v = await this.get<string>("get_server_version");
    return String(v);
  }

  async getFreeSpace(): Promise<number> {
    const n = await this.get<number>("free_space");
    return Number(n);
  }

  // ── Queue / Packages ────────────────────────────────────────────────────────

  /**
   * Returns all packages in the download queue with their links.
   * pyLoad NG's get_queue_data() uses no params — defaults to Destination.QUEUE.
   */
  async getQueue(): Promise<PyLoadPackage[]> {
    const data = await this.get<PyLoadPackage[]>("get_queue_data");
    return Array.isArray(data) ? data : [];
  }

  /** Returns packages in the collector (dest=0) with links. */
  async getCollector(): Promise<PyLoadPackage[]> {
    const data = await this.get<PyLoadPackage[]>("get_collector_data");
    return Array.isArray(data) ? data : [];
  }

  /**
   * Returns real-time download status for all actively running links.
   * This is the only place pyLoad exposes live speed, bleft, and percent.
   */
  async getActiveDownloads(): Promise<PyLoadActiveDownload[]> {
    const data = await this.get<PyLoadActiveDownload[]>("status_downloads");
    return Array.isArray(data) ? data : [];
  }

  /**
   * Add a package to pyLoad.
   * @param name   Package name
   * @param links  Array of URLs
   * @param dest   0 = collector, 1 = queue (default)
   * @returns package ID
   */
  async addPackage(name: string, links: string[], dest = 1): Promise<number> {
    const id = await this.post<number>("add_package", { name, links, dest });
    return Number(id);
  }

  /** Delete packages by their IDs. */
  async deletePackages(pids: number[]): Promise<void> {
    await this.post("delete_packages", { package_ids: pids });
  }

  /** Restart (re-queue) a single package. */
  async restartPackage(pid: number): Promise<void> {
    await this.post("restart_package", { package_id: pid });
  }

  /** Move package to the download queue (destination=1). */
  async moveToQueue(pid: number): Promise<void> {
    // move_package(destination: Destination, package_id: int) — 1 = QUEUE
    await this.post("move_package", { destination: 1, package_id: pid });
  }

  // ── Download control ────────────────────────────────────────────────────────

  async pause(): Promise<void> {
    await this.post("pause_server");
  }

  async unpause(): Promise<void> {
    await this.post("unpause_server");
  }

  async togglePause(): Promise<void> {
    await this.post("toggle_pause");
  }

  async stopAllDownloads(): Promise<void> {
    await this.post("stop_all_downloads");
  }

  async restartFailed(): Promise<void> {
    await this.post("restart_failed");
  }

  async deleteFinished(): Promise<void> {
    await this.post("delete_finished");
  }

  async stopDownloads(fids: number[]): Promise<void> {
    await this.post("stop_downloads", { file_ids: fids });
  }
}
