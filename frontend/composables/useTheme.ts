const THEMES = ["tron", "sark", "light", "matrix", "xp", "spectrum"] as const;
export type ThemeId = (typeof THEMES)[number];

export const THEME_META: Record<ThemeId, { name: string; icon: string; description: string }> = {
  tron: {
    name: "Tron",
    icon: "mdi-chip",
    description: "Dark neon circuits from the Grid",
  },
  sark: {
    name: "Sark",
    icon: "mdi-sine-wave",
    description: "Dark red-purple neon circuits",
  },
  light: {
    name: "Light",
    icon: "mdi-white-balance-sunny",
    description: "Clean white & grey gradients",
  },
  matrix: {
    name: "Matrix",
    icon: "mdi-matrix",
    description: "Dark green terminal hacker mode",
  },
  xp: {
    name: "Windows XP",
    icon: "mdi-microsoft-windows",
    description: "Classic Luna UI with Tahoma, 3D buttons & blue title bars",
  },
  spectrum: {
    name: "ZX Spectrum",
    icon: "mdi-television-classic",
    description: "Authentic ZX Spectrum 48K palette with pixel font",
  },
};

export function useTheme() {
  const currentTheme = useState<ThemeId>("theme", () => "tron");
  const canvasEnabled = useState<boolean>("canvas-enabled", () => true);

  function setCanvasEnabled(v: boolean) {
    canvasEnabled.value = v;
    if (import.meta.client) {
      localStorage.setItem("canvas-effects", String(v));
    }
  }

  function setTheme(id: ThemeId) {
    currentTheme.value = id;
    if (import.meta.client) {
      document.documentElement.setAttribute("data-theme", id);
      localStorage.setItem("sark-theme", id);
      if (canvasEnabled.value) {
        canvasEnabled.value = false;
        setTimeout(() => {
          canvasEnabled.value = true;
        }, 1000);
      }
      window.dispatchEvent(new CustomEvent("app-theme-change", { detail: id }));
    }
  }

  function loadTheme() {
    if (import.meta.client) {
      const saved = localStorage.getItem("sark-theme") as ThemeId | null;
      if (saved && THEMES.includes(saved)) {
        setTheme(saved);
      }
    }
  }

  /** Sync theme from server preference (called after login) */
  async function syncFromServer() {
    try {
      const { data } = await useFetch("/api/users/preferences", {
        baseURL: useRuntimeConfig().public.apiBase as string,
        headers: { Authorization: `Bearer ${useCookie("token").value}` },
      });
      if (data.value && (data.value as any).theme) {
        const t = (data.value as any).theme as ThemeId;
        if (THEMES.includes(t)) setTheme(t);
      }
    } catch {
      /* silent */
    }
  }

  /** Save theme preference to server */
  async function saveToServer(id: ThemeId) {
    try {
      await $fetch("/api/users/preferences", {
        baseURL: useRuntimeConfig().public.apiBase as string,
        method: "POST",
        headers: { Authorization: `Bearer ${useCookie("token").value}` },
        body: { theme: id },
      });
    } catch {
      /* silent */
    }
  }

  return {
    currentTheme,
    canvasEnabled,
    setCanvasEnabled,
    setTheme,
    loadTheme,
    syncFromServer,
    saveToServer,
    THEME_META,
    themes: THEMES,
  };
}
