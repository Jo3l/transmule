/**
 * Auth state composable.
 * Stores JWT in a cookie so it survives page reloads.
 */

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

export function useAuth() {
  const token = useCookie<string | null>("auth_token", {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: "lax",
  });
  const user = useState<User | null>("auth_user", () => null);

  function setAuth(t: string, u: User) {
    token.value = t;
    user.value = u;
  }

  function clear() {
    token.value = null;
    user.value = null;
  }

  /**
   * Fetch the current user profile from the middleware.
   * Returns false if not authenticated.
   */
  async function fetchUser(): Promise<boolean> {
    if (!token.value) return false;
    try {
      const config = useRuntimeConfig();
      const data = await $fetch<User>("/api/users/me", {
        baseURL: config.public.apiBase,
        headers: { Authorization: `Bearer ${token.value}` },
      });
      user.value = data;
      return true;
    } catch {
      clear();
      return false;
    }
  }

  return { token, user, setAuth, clear, fetchUser };
}
