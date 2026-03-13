/**
 * API client composable.
 * Wraps $fetch with the middleware base URL and JWT auth header.
 * Shows toast notifications when the middleware can't reach aMule.
 */

// ─── Debounced toast state (shared across all useApi() instances) ────────────
// Prevents spamming toasts when multiple polling components all fail at once.
let _lastToastTime = 0;
const TOAST_COOLDOWN = 15_000; // show at most one error toast per 15 s
let _amuleDown = false; // tracks whether we've already notified the user

export function useApi() {
  const config = useRuntimeConfig();
  const auth = useAuth();
  const { showToast: _toast } = useToast();
  const { t } = useI18n();

  /** Show a toast notification (debounced). */
  function showToast(
    message: string,
    type: "success" | "warning" | "info" | "error" = "error",
    duration: number = 6000,
  ) {
    const now = Date.now();
    if (now - _lastToastTime < TOAST_COOLDOWN) return;
    _lastToastTime = now;

    _toast(message, type, duration);
  }

  /** Map middleware error codes to user-friendly messages. */
  function amuleErrorMessage(status: number, serverMessage?: string): string {
    switch (status) {
      case 502:
        return t("errors.cannotConnect");
      case 504:
        return t("errors.timeout");
      case 503:
        return t("errors.tooManyRequests");
      case 408:
        return t("errors.expired");
      default:
        return serverMessage || t("errors.middlewareError", { status });
    }
  }

  async function apiFetch<T = any>(
    path: string,
    opts: Parameters<typeof $fetch>[1] = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string>),
    };

    // JWT is sent via the auth_token cookie (set by useCookie in useAuth).
    // Do NOT add an Authorization: Bearer header — that header is used by
    // nginx HTTP Basic auth on the reverse proxy and would be overwritten.

    const isAmuleRoute = path.startsWith("/api/amule/");

    try {
      const result = await $fetch<T>(path, {
        baseURL: config.public.apiBase,
        ...opts,
        headers,
      });

      // Only track aMule recovery — other services (transmission, pyload)
      // succeeding must not clear the aMule-down flag.
      if (isAmuleRoute && _amuleDown) {
        _amuleDown = false;
        _lastToastTime = 0; // allow immediate recovery toast
        showToast(t("errors.connectionRestored"), "success", 4000);
      }

      return result;
    } catch (err: any) {
      const status = err?.response?.status || err?.status || 0;

      // Auto-logout on 401
      if (status === 401) {
        auth.clear();
        navigateTo("/login");
        throw err;
      }

      // aMule connectivity errors (502, 504, 503, 408) — only for aMule routes
      if (isAmuleRoute && [502, 504, 503, 408].includes(status)) {
        _amuleDown = true;
        const serverMsg =
          err?.response?._data?.statusMessage ||
          err?.data?.statusMessage ||
          err?.statusMessage ||
          "";
        showToast(amuleErrorMessage(status, serverMsg));
      }

      throw err;
    }
  }

  return { apiFetch, showToast };
}
