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
      // pyLoad NG only exposes /api/<func> — /api/v1/ does NOT exist and
      // causes Flask's 404 handler to return {"error":"Not Found"} as JSON,
      // which surfaces as a misleading 502 "Not Found" in our middleware.
      paths.push(`${this.baseUrl}/api/${cmd}`);
    }

    return [...new Set(paths)];
  }

  private extractCsrfToken(html: string): string | null {
    // name before value (standard Flask-WTF form input)
    const m1 = html.match(
      /name=(["'])csrf_token\1[^>]*value=(["'])([^"']+)\2/i,
    );
    if (m1?.[3]) return m1[3];

    // value before name (some template variants)
    const m2 = html.match(
      /value=(["'])([^"']+)\1[^>]*name=(["'])csrf_token\3/i,
    );
    if (m2?.[2]) return m2[2];

    // meta tag (csrf-token or csrf_token)
    const m3 = html.match(
      /<meta[^>]*name=(["'])csrf[-_]token\1[^>]*content=(["'])([^"']+)\2/i,
    );
    if (m3?.[3]) return m3[3];

    // JS variable assignment: csrfToken = "TOKEN" / csrf_token: "TOKEN"
    const m4 = html.match(/csrf[_-]?token["']?\s*[:=]\s*["']([^"']{20,})["']/i);
    if (m4?.[1]) return m4[1];

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
      // Some pyLoad/Flask setups only accept the dashed header name.
      headers["X-CSRF-Token"] = this.csrfToken;
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

  private async refreshSessionCsrf(): Promise<boolean> {
    this.apiKey = null;
    this.authMode = "basic";
    this.csrfToken = null;
    this.hasSessionAuth = false;
    this.cookieHeader = "";
    return this.ensureSessionCookie();
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

  private isNotFoundApiError(err: any): boolean {
    const msg = String(err?.statusMessage || err?.message || "").toLowerCase();
    return err?.statusCode === 502 && msg.includes("not found");
  }

  private async postWithCommandFallbacks<T = unknown>(
    commands: string[],
    data: Record<string, unknown> = {},
  ): Promise<T> {
    let lastErr: any = null;

    for (const command of commands) {
      try {
        return await this.post<T>(command, data);
      } catch (err: any) {
        lastErr = err;
        if (this.isNotFoundApiError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastErr;
  }

  private async postJsonWithCommandFallbacks<T = unknown>(
    commands: string[],
    data: Record<string, unknown> = {},
  ): Promise<T> {
    let lastErr: any = null;

    for (const command of commands) {
      try {
        return await this.postJson<T>(command, data);
      } catch (err: any) {
        lastErr = err;
        if (this.isNotFoundApiError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastErr;
  }

  private async getWithCommandFallbacks<T = unknown>(
    commands: string[],
    params?: Record<string, string>,
  ): Promise<{ command: string; data: T }> {
    let lastErr: any = null;

    for (const command of commands) {
      try {
        const data = await this.get<T>(command, params);
        return { command, data };
      } catch (err: any) {
        lastErr = err;
        if (this.isNotFoundApiError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastErr;
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
    opts?: { jsonEncodeValues?: boolean },
  ): Promise<T> {
    // pyLoad expects form-encoded data where each value is JSON-encoded.
    // Prefer API key auth for REST endpoints; fall back to session+CSRF when needed.
    if (this.authMode !== "apikey") {
      const hasApiKey = await this.ensureApiKey().catch(() => false);
      if (!hasApiKey) {
        await this.ensureSessionCookie().catch(() => false);
      }
    }

    let lastStatus = 0;
    let lastStatusText = "";
    let lastBody: any = null;
    let triedCompatAuthUpgrade = false;

    for (const endpoint of this.endpointCandidates(command)) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const body = new URLSearchParams();
        const jsonEncodeValues = opts?.jsonEncodeValues !== false;
        for (const [k, v] of Object.entries(data)) {
          if (jsonEncodeValues) {
            body.append(k, JSON.stringify(v));
            continue;
          }

          if (Array.isArray(v)) {
            for (const entry of v) {
              body.append(k, String(entry ?? ""));
            }
            continue;
          }

          if (v == null) {
            body.append(k, "");
            continue;
          }

          if (typeof v === "object") {
            body.append(k, JSON.stringify(v));
            continue;
          }

          body.append(k, String(v));
        }

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
        const csrfInvalid =
          this.isCompatAuthPayload(responseBody) &&
          this.extractErrorMessage(responseBody).toLowerCase().includes("csrf");

        if (res.ok) {
          if (
            this.isPyLoadErrorPayload(responseBody) ||
            this.isCompatAuthPayload(responseBody)
          ) {
            if (!triedCompatAuthUpgrade && csrfInvalid) {
              triedCompatAuthUpgrade = true;
              const refreshed = await this.refreshSessionCsrf();
              if (refreshed) {
                continue;
              }
            }
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

        // HTTP 400 with CSRF error body (Flask-WTF raises BadRequest for bad token).
        const isCsrf400 =
          res.status === 400 &&
          this.extractErrorMessage(responseBody).toLowerCase().includes("csrf");

        if (!triedCompatAuthUpgrade && isCsrf400) {
          triedCompatAuthUpgrade = true;
          const refreshed = await this.refreshSessionCsrf();
          if (refreshed) {
            continue;
          }
        }

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

  private async postJson<T = unknown>(
    command: string,
    data: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.authMode !== "apikey") {
      const hasApiKey = await this.ensureApiKey().catch(() => false);
      if (!hasApiKey) {
        await this.ensureSessionCookie().catch(() => false);
      }
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
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(15_000),
        });

        this.updateCookies(res);
        const responseBody = await this.parseResponseBody(res);
        const responseError =
          this.extractErrorMessage(responseBody).toLowerCase();
        const csrfInvalid = responseError.includes("csrf");

        if (res.ok) {
          if (
            this.isPyLoadErrorPayload(responseBody) ||
            this.isCompatAuthPayload(responseBody)
          ) {
            if (!triedCompatAuthUpgrade && csrfInvalid) {
              triedCompatAuthUpgrade = true;
              const refreshed = await this.refreshSessionCsrf();
              if (refreshed) {
                continue;
              }
            }
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

        const isCsrf400 = res.status === 400 && csrfInvalid;

        if (!triedCompatAuthUpgrade && isCsrf400) {
          triedCompatAuthUpgrade = true;
          const refreshed = await this.refreshSessionCsrf();
          if (refreshed) {
            continue;
          }
        }

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
    const safeName = String(name || "").trim();
    const safeLinks = links
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    const payload = {
      name: safeName,
      links: safeLinks,
      dest,
    };

    // pyLoad API source declares add_package(name, links, dest) as POST.
    // Prefer JSON body (supported by /api/<func>) and fall back to form body.
    const commandAttempts = ["add_package", "addPackage"];

    let lastErr: any = null;
    for (const command of commandAttempts) {
      try {
        const result = await this.postJson<unknown>(command, payload);
        const parsed = Number(result);
        return Number.isFinite(parsed) ? parsed : -1;
      } catch (err: any) {
        lastErr = err;
      }

      try {
        const result = await this.post<unknown>(command, payload);
        const parsed = Number(result);
        return Number.isFinite(parsed) ? parsed : -1;
      } catch (err: any) {
        lastErr = err;
      }
    }

    throw lastErr;
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
    await this.postWithCommandFallbacks([
      "pause_server",
      "pause",
      "pause_downloads",
    ]);
  }

  async unpause(): Promise<void> {
    await this.postWithCommandFallbacks([
      "unpause_server",
      "unpause",
      "resume",
      "resume_downloads",
    ]);
  }

  async togglePause(): Promise<void> {
    await this.postWithCommandFallbacks(["toggle_pause", "togglepause"]);
  }

  async stopAllDownloads(): Promise<void> {
    await this.postWithCommandFallbacks([
      "stop_all_downloads",
      "stop_all",
      "abort_all_downloads",
      "abort_all",
    ]);
  }

  async restartFailed(): Promise<void> {
    await this.postWithCommandFallbacks([
      "restart_failed",
      "restart_failed_downloads",
      "retry_failed",
    ]);
  }

  async deleteFinished(): Promise<void> {
    const commandCandidates = [
      "deleteFinished",
      "delete_finished",
      "delete_finished_packages",
      "clear_finished",
    ];

    let lastErr: any = null;

    for (const command of commandCandidates) {
      try {
        await this.post(command);
        return;
      } catch (err: any) {
        lastErr = err;
        const detail = String(
          err?.statusMessage || err?.message || "",
        ).toLowerCase();
        const shouldContinue =
          err?.statusCode === 502 &&
          (detail.includes("not found") ||
            detail.includes("internal server error") ||
            detail.includes("method not allowed"));

        if (shouldContinue) {
          continue;
        }

        throw err;
      }
    }

    const detail = String(
      lastErr?.statusMessage || lastErr?.message || "",
    ).toLowerCase();
    const shouldManualFallback =
      lastErr?.statusCode === 502 && detail.includes("not found");

    if (!shouldManualFallback) {
      throw lastErr;
    }

    const [queue, collector] = await Promise.all([
      this.getQueue().catch(() => [] as PyLoadPackage[]),
      this.getCollector().catch(() => [] as PyLoadPackage[]),
    ]);

    const finishedPids = [...queue, ...collector]
      .filter((pkg) => Array.isArray(pkg.links) && pkg.links.length > 0)
      .filter((pkg) => pkg.links!.every((link) => Number(link.status) === 0))
      .map((pkg) => Number(pkg.pid))
      .filter((pid) => Number.isFinite(pid));

    if (!finishedPids.length) {
      return;
    }

    await this.deletePackages(finishedPids);
  }

  async stopDownloads(fids: number[]): Promise<void> {
    await this.post("stop_downloads", { file_ids: fids });
  }

  // ── Configuration ────────────────────────────────────────────────────────

  async getConfig(): Promise<Record<string, any>> {
    const config = await this.get<Record<string, any>>("get_config");
    return config || {};
  }

  async getConfigValue(
    category: string,
    option: string,
    section = "core",
  ): Promise<unknown> {
    return this.get<unknown>("get_config_value", {
      category,
      option,
      section,
    });
  }

  async getPluginConfig(): Promise<Record<string, any>> {
    const plugins = await this.get<Record<string, any>>("get_plugin_config");
    return plugins && typeof plugins === "object" && !Array.isArray(plugins)
      ? plugins
      : {};
  }

  async getAccounts(refresh = false): Promise<any[]> {
    const accounts = await this.get<any[]>("get_accounts", {
      refresh: refresh ? "1" : "0",
    });
    return Array.isArray(accounts) ? accounts : [];
  }

  async getAccountTypes(): Promise<string[]> {
    const types = await this.get<string[]>("get_account_types");
    return Array.isArray(types)
      ? types
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right))
      : [];
  }

  async updateAccount(
    plugin: string,
    account: string,
    password?: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      plugin,
      account,
    };

    if (typeof password === "string" && password.length > 0) {
      payload.password = password;
    }

    if (options && Object.keys(options).length > 0) {
      payload.options = options;
    }

    await this.postJsonWithCommandFallbacks(["update_account"], payload);
  }

  async removeAccount(plugin: string, account: string): Promise<void> {
    await this.postJsonWithCommandFallbacks(["remove_account"], {
      plugin,
      account,
    });
  }

  async getLogs(limit = 400): Promise<{ command: string; data: unknown }> {
    const sanitizedLimit = Number.isFinite(limit)
      ? String(Math.max(10, Math.min(2000, Math.trunc(limit))))
      : "400";

    const commandAttempts: Array<{
      commands: string[];
      params?: Record<string, string>;
    }> = [
      { commands: ["get_log"], params: { limit: sanitizedLimit } },
      { commands: ["get_log"] },
    ];

    let lastErr: any = null;

    for (const attempt of commandAttempts) {
      try {
        return await this.getWithCommandFallbacks<unknown>(
          attempt.commands,
          attempt.params,
        );
      } catch (err: any) {
        lastErr = err;
        if (this.isNotFoundApiError(err)) {
          continue;
        }

        const msg = String(
          err?.statusMessage || err?.message || "",
        ).toLowerCase();
        if (
          msg.includes("unknown") ||
          msg.includes("invalid") ||
          msg.includes("missing")
        ) {
          continue;
        }

        throw err;
      }
    }

    throw lastErr;
  }

  async setConfigValue(
    category: string,
    option: string,
    value: string | number | boolean,
    section = "core",
  ): Promise<void> {
    await this.postJsonWithCommandFallbacks(["set_config_value"], {
      category,
      option,
      value,
      section,
    });
  }
}
