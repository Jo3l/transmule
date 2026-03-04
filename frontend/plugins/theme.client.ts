export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const { setTheme, themes, canvasEnabled } = useTheme();
    const saved = localStorage.getItem("sark-theme") as any;
    if (saved && (themes as readonly string[]).includes(saved)) {
      setTheme(saved);
    } else {
      setTheme("tron");
    }
    const ce = localStorage.getItem("canvas-effects");
    canvasEnabled.value = ce === null ? true : ce === "true";
  }
});
