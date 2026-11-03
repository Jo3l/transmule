/**
 * Thin client for the public share endpoints.
 *
 * Deliberately does NOT use `useApi()`: that helper logs the user out and
 * redirects to /login on any 401, and here a 401 simply means "wrong code".
 * Errors are rethrown so each page can map them to its own message.
 */

export interface ShareMeta {
  id: string;
  label: string;
  kind: "file" | "folder" | "selection";
  needsCode: boolean;
  itemCount: number;
  expiresAt: string;
}

export interface ShareRoot {
  path: string;
  name: string;
  type: "file" | "dir";
}

export interface ShareEntry {
  name: string;
  type: "file" | "dir";
  size: number;
}

export interface ShareUnlocked {
  ticket: string;
  label: string;
  kind: "file" | "folder" | "selection";
  expiresAt: string;
  roots: ShareRoot[];
}

const TICKET_PREFIX = "share-ticket:";
const ROOTS_PREFIX = "share-roots:";

export function useSharePublic() {
  const config = useRuntimeConfig();
  const base = String(config.public.apiBase || "").replace(/\/+$/, "");

  const endpoint = (ref: string, suffix = "") =>
    `${base}/api/share/public/${encodeURIComponent(ref)}${suffix}`;

  async function meta(ref: string): Promise<ShareMeta> {
    return await $fetch<ShareMeta>(endpoint(ref));
  }

  async function unlock(ref: string, code?: string): Promise<ShareUnlocked> {
    return await $fetch<ShareUnlocked>(endpoint(ref, "/unlock"), {
      method: "POST",
      body: code ? { code } : {},
    });
  }

  async function resolveCode(code: string): Promise<ShareUnlocked & { id: string }> {
    return await $fetch<ShareUnlocked & { id: string }>(`${base}/api/share/public/code`, {
      method: "POST",
      body: { code },
    });
  }

  async function list(ref: string, path: string, ticket: string) {
    return await $fetch<{ path: string; entries: ShareEntry[] }>(endpoint(ref, "/list"), {
      query: { path, t: ticket },
    });
  }

  function fileUrl(ref: string, path: string, ticket: string): string {
    return `${endpoint(ref, "/file")}?path=${encodeURIComponent(path)}&t=${encodeURIComponent(ticket)}`;
  }

  /**
   * A ticket alone is not enough to render the page: the roots describe what to
   * list. Store both so `/s/<id>` works right after `/s` resolved a code.
   */
  function storeSession(shareId: string, ticket: string, roots: ShareRoot[]): void {
    try {
      sessionStorage.setItem(TICKET_PREFIX + shareId, ticket);
      sessionStorage.setItem(ROOTS_PREFIX + shareId, JSON.stringify(roots));
    } catch {
      /* private mode: the ticket just lives in memory for this view */
    }
  }

  function readRoots(shareId: string): ShareRoot[] {
    try {
      const raw = sessionStorage.getItem(ROOTS_PREFIX + shareId);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readTicket(shareId: string): string {
    try {
      return sessionStorage.getItem(TICKET_PREFIX + shareId) || "";
    } catch {
      return "";
    }
  }

  function clearTicket(shareId: string): void {
    try {
      sessionStorage.removeItem(TICKET_PREFIX + shareId);
      sessionStorage.removeItem(ROOTS_PREFIX + shareId);
    } catch {
      /* ignore */
    }
  }

  return { meta, unlock, resolveCode, list, fileUrl, storeSession, readTicket, readRoots, clearTicket };
}

/** Status code of a failed `$fetch` call. */
export function shareErrorStatus(error: any): number {
  return Number(error?.response?.status ?? error?.statusCode ?? error?.status ?? 0);
}

export function formatShareSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
