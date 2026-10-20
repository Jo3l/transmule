import { APP_VERSION, GITHUB_REPO } from "~/utils/constants";

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useVersionCheck() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { apiFetch } = useApi();

  onMounted(async () => {
    // Reportar la versión que corre el SPA: el marcador de presencia la publica
    // y así no depende de que el usuario abra los ajustes de slskd.
    apiFetch("/api/app/version", { method: "POST", body: { version: APP_VERSION } }).catch(() => {});

    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/frontend/package.json?t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const pkg = await res.json();
      const latest = pkg.version as string;
      if (compareVersions(latest, APP_VERSION) > 0) {
        const message =
          t("app.updateAvailable", { latest, current: APP_VERSION }) +
          "\n" +
          t("app.updateInstructions");
        showToast(message, "warning", 0, true);
      }
    } catch {
      // network error — silently ignore
    }
  });
}
