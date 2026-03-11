// https://nuxt.com/docs/api/configuration/nuxt-config
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  telemetry: false,

  // SPA mode — no SSR needed for a private dashboard app.
  ssr: false,

  experimental: {
    // Disable app manifest to avoid #app-manifest import resolution errors
    // in SPA mode (Nuxt 3.14+).
    appManifest: false,
  },

  modules: ["@nuxtjs/i18n"],

  i18n: {
    locales: [
      { code: "en", name: "English", file: "en.json" },
      { code: "es", name: "Español", file: "es.json" },
      { code: "it", name: "Italiano", file: "it.json" },
    ],
    defaultLocale: "en",
    lazy: true,
    strategy: "no_prefix",
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "sark-lang",
      fallbackLocale: "en",
    },
  },

  devServer: {
    port: 3001,
  },

  // In dev mode, Vite proxies /api/* → middleware, mirroring what nginx does
  // in production. No NUXT_PUBLIC_API_BASE override needed for local dev.
  vite: {
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  },

  css: ["~/assets/scss/main.scss"],

  runtimeConfig: {
    public: {
      // Empty string = relative URL (same origin).
      // In production: nginx proxies /api/* → middleware container.
      // In dev: Vite's server.proxy below proxies /api/* → localhost:3000.
      apiBase: "",
    },
  },

  app: {
    head: {
      title: "TransMule",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#080810" },
        { property: "og:image", content: "/og-image.png" },
        { property: "og:title", content: "TransMule" },
        { property: "og:type", content: "website" },
      ],
      link: [
        // ── Favicons ──────────────────────────────────────────────────────
        { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
        { rel: "icon", type: "image/png", sizes: "128x128", href: "/favicon-128.png" },
        { rel: "apple-touch-icon", sizes: "320x320", href: "/apple-touch-icon.png" },
        // ── Fonts ─────────────────────────────────────────────────────────
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
        },
        {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/npm/@mdi/font@7/css/materialdesignicons.min.css",
        },
      ],
    },
  },
});
