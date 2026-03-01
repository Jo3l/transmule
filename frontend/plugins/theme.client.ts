export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const saved = localStorage.getItem("sark-theme") || "sark";
    document.documentElement.setAttribute("data-theme", saved);
  }
});
