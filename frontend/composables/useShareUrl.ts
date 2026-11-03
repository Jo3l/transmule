/**
 * Public URL for a share link.
 *
 * Built from the browser's own origin: whatever host the operator is using
 * (LAN IP, reverse-proxied domain) is the host the QR must point at. No
 * `X-Forwarded-*` guessing and no credentials in the URL — the reverse proxy
 * asks for its own auth when the page is opened.
 */
export function useShareUrl() {
  const config = useRuntimeConfig();
  const base = String(config.app.baseURL || "").replace(/\/+$/, "");

  return (token: string) => `${window.location.origin}${base}/s/${token}`;
}

/** True when the QR would only work on this machine. */
export function shareUrlIsLocal(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
