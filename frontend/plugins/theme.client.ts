export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const saved = localStorage.getItem("sark-theme") || "tron";
    document.documentElement.setAttribute("data-theme", saved);
  }
});
