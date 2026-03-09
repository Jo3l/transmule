export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const { setTheme, themes, _canvasPref } = useTheme();

    // Seed the raw canvas preference from localStorage BEFORE setTheme,
    // so setTheme's restart animation check sees the correct value.
    // canvasEnabled (computed) will still return false on mobile regardless.
    const ce = localStorage.getItem("canvas-effects");
    _canvasPref.value = ce === null ? true : ce === "true";

    const saved = localStorage.getItem("sark-theme") as any;
    if (saved && (themes as readonly string[]).includes(saved)) {
      setTheme(saved);
    } else {
      setTheme("tron");
    }
  }
});
