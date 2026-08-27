/**
 * Cliente HTTP del motor — fetch con cookie jar, headers y timeout.
 * Soporta login (POST de credenciales) para indexers privados.
 */

export interface FetchOptions {
  method?: string;
  responseType?: "html" | "json";
  inputs?: Record<string, string>;
  headers?: Record<string, string | string[]>;
  timeoutMs?: number;
}

export interface PageResult {
  html: string;
  json: unknown;
  status: number;
  finalUrl: string;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export class HttpClient {
  private cookies: Record<string, string> = {};

  setCookies(c: Record<string, string>): void {
    this.cookies = { ...this.cookies, ...c };
  }

  getCookies(): Record<string, string> {
    return { ...this.cookies };
  }

  private cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  /** Guarda las cookies de Set-Cookie de una respuesta. */
  private captureCookies(resp: Response): void {
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }

  async fetch(url: string, opts: FetchOptions = {}): Promise<PageResult> {
    const { method = "GET", responseType = "html", inputs, headers: customHeaders, timeoutMs = 15_000 } = opts;
    const headers = new Headers({ "User-Agent": DEFAULT_UA });
    const cookie = this.cookieHeader();
    if (cookie) headers.set("Cookie", cookie);
    if (customHeaders) {
      for (const [name, raw] of Object.entries(customHeaders)) {
        for (const v of Array.isArray(raw) ? raw : [raw]) {
          if (v !== "") headers.append(name, v);
        }
      }
    }

    let finalUrl = url;
    let body: string | undefined;

    if (inputs && Object.keys(inputs).length > 0) {
      const qs = new URLSearchParams(inputs);
      const declaresJson = (headers.get("Content-Type") ?? "").includes("json");
      if (declaresJson) {
        // API JSON (p.ej. AvistaZ /auth): body serializado, no form-urlencoded.
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(inputs);
      } else if (method === "POST") {
        headers.set("Content-Type", "application/x-www-form-urlencoded");
        body = qs.toString();
      } else {
        const u = new URL(url);
        for (const [k, v] of qs) u.searchParams.set(k, v);
        finalUrl = u.toString();
      }
    }

    const resp = await fetch(finalUrl, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    this.captureCookies(resp);

    const text = await resp.text();
    let json: unknown = null;
    if (responseType === "json" || (resp.headers.get("content-type") ?? "").includes("json")) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return { html: text, json, status: resp.status, finalUrl: resp.url || finalUrl };
  }
}
