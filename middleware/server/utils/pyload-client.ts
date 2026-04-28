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
  private username: string;
  private password: string;
  private apiKey: string | null = null;
  private cookieHeader = "";
  private csrfToken: string | null = null;
  private hasSessionAuth = false;
  private authMode: "basic" | "apikey" = "basic";

  constructor(config: PyLoadConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.username = config.username;
    this.password = config.password;
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.username}:${config.password}`).toString("base64");
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private toLegacyCommand(command: string): string {
    return command.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  }

  private commandCandidates(command: string): string[] {
    const candidates = [command, this.toLegacyCommand(command)];
    return [...new Set(candidates)];
  }

  private endpointCandidates(command: string): string[] {
    const commands = this.commandCandidates(command);
    const paths: string[] = [];

    for (const cmd of commands) {
      paths.push(`${this.baseUrl}/api/${cmd}`);
      // Newer pyLoad variants may expose rpc methods below /api/v1.
      paths.push(`${this.baseUrl}/api/v1/${cmd}`);
    }

    return [...new Set(paths)];
  }

  private extractCsrfToken(html: string): string | null {
    const inputMatch = html.match(
      /name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i,
    );
    if (inputMatch?.[1]) return inputMatch[1];

    const metaMatch = html.match(
      /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
    );
    if (metaMatch?.[1]) return metaMatch[1];

    return null;
  }

  private buildAuthHeaders(opts?: {
    includeCsrf?: boolean;
  }): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.authMode === "apikey" && this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    } else {
      headers.Authorization = this.authHeader;
    }
    if (opts?.includeCsrf && this.csrfToken && this.authMode !== "apikey") {
      headers["X-CSRFToken"] = this.csrfToken;
    }
    if (this.cookieHeader) headers.Cookie = this.cookieHeader;
    return headers;
  }

  private updateCookies(res: Response) {
    const setCookies: string[] =
      ((res.headers as any).getSetCookie?.() as string[] | undefined) || [];

    if (setCookies.length === 0) {
      const single = res.headers.get("set-cookie");
      if (single) setCookies.push(single);
    }

    if (!setCookies.length) return;

    const jar = new Map<string, string>();
    if (this.cookieHeader) {
      for (const pair of this.cookieHeader.split(";")) {
        const [rawK, ...rest] = pair.trim().split("=");
        if (!rawK || rest.length === 0) continue;
        jar.set(rawK, rest.join("="));
      }
    }

    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const [rawK, ...rest] = pair.trim().split("=");
      if (!rawK || rest.length === 0) continue;
      jar.set(rawK, rest.join("="));
    }

    this.cookieHeader = [...jar.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private async ensureSessionCookie(): Promise<boolean> {
    if (this.hasSessionAuth && this.cookieHeader.includes("session="))
      return true;

    // Fetch login page first to get a valid CSRF token and initial session cookie.
    const loginPageRes = await fetch(`${this.baseUrl}/login`, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });

    this.updateCookies(loginPageRes);
    const loginPageHtml = await loginPageRes.text().catch(() => "");
    const tokenFromPage = this.extractCsrfToken(loginPageHtml);
    if (tokenFromPage) this.csrfToken = tokenFromPage;

    const body = new URLSearchParams();
    body.set("do", "login");
    body.set("username", this.username);
    body.set("password", this.password);
    if (this.csrfToken) body.set("csrf_token", this.csrfToken);

    const res = await fetch(`${this.baseUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      },
      body: body.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    this.updateCookies(res);

    // Successful login generally redirects to dashboard and sets session cookie.
    const ok =
      [200, 302, 303].includes(res.status) &&
      this.cookieHeader.includes("session=");
    this.hasSessionAuth = ok;

    if (ok) {
      // The login response is a redirect (302/303) whose body contains no CSRF token.
      // Fetch the dashboard with the new session cookie to get the post-login CSRF token
      // that is valid for the authenticated session.
      try {
        const dashRes = await fetch(`${this.baseUrl}/`, {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            Cookie: this.cookieHeader,
          },
          signal: AbortSignal.timeout(15_000),
        });
        this.updateCookies(dashRes);
        const dashHtml = await dashRes.text().catch(() => "");
        const freshToken = this.extractCsrfToken(dashHtml);
        if (freshToken) this.csrfToken = freshToken;
      } catch {
        // Non-fatal: proceed with whatever token we have from the login page.
      }
    }

    return ok;
  }

  private async ensureApiKey(): Promise<boolean> {
    if (this.apiKey) {
      this.authMode = "apikey";
      return true;
    }

    const hasSession = await this.ensureSessionCookie();
    if (!hasSession) return false;

    const res = await fetch(`${this.baseUrl}/json/generate_apikey`, {
      method: "POST",
      headers: {
        ...this.buildAuthHeaders({ includeCsrf: true }),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        user: this.username,
        password: this.password,
        name: "transmule",
        expires: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    this.updateCookies(res);

    if (!res.ok) return false;

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      return false;
    }

    const key = json?.data?.key;
    if (json?.success === true && typeof key === "string" && key) {
      this.apiKey = key;
      this.authMode = "apikey";
      return true;
    }

    return false;
  }

  /**
   * Try to upgrade auth when pyLoad rejects credentials.
   * For newer pyLoad, a logged-in session can already authorize GET RPC calls
   * even if API key creation is not permitted for this user.
   */
  private async ensureCompatibleAuth(): Promise<boolean> {
    // If the previous auth method was rejected, reset state and rebuild.
    this.apiKey = null;
    this.csrfToken = null;
    this.cookieHeader = "";
    this.authMode = "basic";
    this.hasSessionAuth = false;

    const hasSession = await this.ensureSessionCookie();
    if (!hasSession) return false;

    // Best-effort: keep working with session auth if key generation is denied.
    await this.ensureApiKey().catch(() => false);
    return true;
  }

  private async parseResponseBody(res: Response): Promise<any> {
    const text = await res.text();
    if (!text || text === "null") return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private extractErrorMessage(body: any): string {
    if (typeof body === "string") return body;
    if (typeof body === "object" && body) {
      if (typeof body.error === "string") return body.error;
      if (typeof body.message === "string") return body.message;
    }
    return "";
  }

  private isCompatAuthMessage(msg: string): boolean {
    const normalized = msg.toLowerCase();
    return (
      normalized.includes("login") ||
      normalized.includes("credential") ||
      normalized.includes("api key") ||
      normalized.includes("access denied") ||
      normalized.includes("csrf") ||
      normalized.includes("unauthorized") ||
      normalized.includes("forbidden") ||
      normalized.includes("session")
    );
  }

  private isCompatAuthError(status: number, body: any): boolean {
    if (![401, 403].includes(status)) return false;
    const msg = this.extractErrorMessage(body);
    if (!msg) return true;
    return this.isCompatAuthMessage(msg);
  }

  private isCompatAuthPayload(body: any): boolean {
    const msg = this.extractErrorMessage(body);
    if (!msg) return false;
    return this.isCompatAuthMessage(msg);
  }

  private isPyLoadErrorPayload(body: any): body is { error: string } {
    return (
      body &&
      typeof body === "object" &&
      typeof body.error === "string" &&
      body.error.length > 0
    );
  }

  private throwApiError(status: number, statusText: string, body: any): never {
    const detail =
      (this.isPyLoadErrorPayload(body) && body.error) ||
      (typeof body === "string" && body) ||
      `${status} ${statusText}`;
    throw createError({
      statusCode: 502,
      statusMessage: `pyLoad API error: ${detail}`,
    });
  }

  private async get<T = unknown>(
    command: string,
    params?: Record<string, string>,
  ): Promise<T> {
    let lastStatus = 0;
    let lastStatusText = "";
    let lastBody: any = null;
    let triedCompatAuthUpgrade = false;

    for (const endpoint of this.endpointCandidates(command)) {
      const url = new URL(endpoint);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url.toString(), {
          headers: {
            ...this.buildAuthHeaders(),
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15_000),
        });

        this.updateCookies(res);
        const body = await this.parseResponseBody(res);

        if (res.ok) {
          if (
            this.isPyLoadErrorPayload(body) ||
            this.isCompatAuthPayload(body)
          ) {
            if (!triedCompatAuthUpgrade && this.isCompatAuthPayload(body)) {
              triedCompatAuthUpgrade = true;
              const upgraded = await this.ensureCompatibleAuth();
              if (upgraded) {
                continue;
              }
            }
            this.throwApiError(res.status, res.statusText, body);
          }
          return body as T;
        }

        lastStatus = res.status;
        lastStatusText = res.statusText;
        lastBody = body;

        if (
          !triedCompatAuthUpgrade &&
          this.isCompatAuthError(res.status, body)
        ) {
          triedCompatAuthUpgrade = true;
          const upgraded = await this.ensureCompatibleAuth();
          if (upgraded) {
            continue;
          }
        }

        break;
      }
    }

    this.throwApiError(lastStatus, lastStatusText, lastBody);
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

    let lastStatus = 0;
    let lastStatusText = "";
    let lastBody: any = null;
    let triedCompatAuthUpgrade = false;

    for (const endpoint of this.endpointCandidates(command)) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            ...this.buildAuthHeaders({ includeCsrf: true }),
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(15_000),
        });

        this.updateCookies(res);
        const responseBody = await this.parseResponseBody(res);

        if (res.ok) {
          if (
            this.isPyLoadErrorPayload(responseBody) ||
            this.isCompatAuthPayload(responseBody)
          ) {
            if (
              !triedCompatAuthUpgrade &&
              this.isCompatAuthPayload(responseBody)
            ) {
              triedCompatAuthUpgrade = true;
              const upgraded = await this.ensureCompatibleAuth();
              if (upgraded) {
                continue;
              }
            }
            this.throwApiError(res.status, res.statusText, responseBody);
          }
          return responseBody as T;
        }

        lastStatus = res.status;
        lastStatusText = res.statusText;
        lastBody = responseBody;

        if (
          !triedCompatAuthUpgrade &&
          this.isCompatAuthError(res.status, responseBody)
        ) {
          triedCompatAuthUpgrade = true;
          const upgraded = await this.ensureCompatibleAuth();
          if (upgraded) {
            continue;
          }
        }

        break;
      }
    }

    this.throwApiError(lastStatus, lastStatusText, lastBody);
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
