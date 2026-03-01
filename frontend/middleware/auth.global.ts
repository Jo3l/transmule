/**
 * Global route middleware — redirects unauthenticated users to /login.
 * Also detects first-run (no users) and redirects to /setup.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // On auth pages, make sure the user is on the correct one
  if (to.path === "/login" || to.path === "/setup") {
    try {
      const config = useRuntimeConfig();
      const status = await $fetch<{ hasUsers: boolean }>("/api/users/status", {
        baseURL: config.public.apiBase,
      });
      if (to.path === "/login" && !status.hasUsers) return navigateTo("/setup");
      if (to.path === "/setup" && status.hasUsers) return navigateTo("/login");
    } catch {
      /* API unreachable — stay on the current page */
    }
    return;
  }

  const auth = useAuth();

  // If we have a token but no user loaded yet, try to validate it
  if (auth.token.value && !auth.user.value) {
    const valid = await auth.fetchUser();
    if (!valid) {
      return navigateTo("/login");
    }
  }

  // No token → check if system needs setup, otherwise redirect to login
  if (!auth.token.value) {
    try {
      const config = useRuntimeConfig();
      const status = await $fetch<{ hasUsers: boolean }>("/api/users/status", {
        baseURL: config.public.apiBase,
      });
      if (!status.hasUsers) {
        return navigateTo("/setup");
      }
    } catch {
      // API unreachable — go to login anyway
    }
    return navigateTo("/login");
  }
});
