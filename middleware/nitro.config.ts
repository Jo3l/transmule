// https://nitro.unjs.io/config
export default defineNitroConfig({
  compatibilityDate: "2025-01-01",
  srcDir: "server",
  experimental: {
    openAPI: true,
  },
  rollupConfig: {
    external: [
      "better-sqlite3",
      "amule-ec-client",
      "node-7z",
      "7zip-bin",
      "node-unrar-js",
    ],
  },
  openAPI: {
    meta: {
      title: "TransMule API Middleware",
      description:
        "REST API middleware for aMule (EC protocol), Transmission (JSON-RPC) and pyLoad.\n\n" +
        "**Services:**\n" +
        "- `/api/amule/*`         — aMule daemon (ED2K / Kademlia)\n" +
        "- `/api/transmission/*`  — Transmission torrent client\n" +
        "- `/api/pyload/*`        — pyLoad NG download manager\n" +
        "- `/api/torrent-search`  — Public torrent index search\n" +
        "- `/api/admin/*`         — Admin management\n\n" +
        "**Swagger UI:** available at `/_scalar`\n\n" +
        "**OpenAPI spec:** available at `/_openapi.json`",
      version: "4.0.0",
    },
  },
  runtimeConfig: {
    amuleHost: "192.168.31.89",
    amulePort: 4712,
    amulePassword: "",
    transmissionUrl: "http://192.168.31.89:9091/transmission/rpc",
    transmissionUsername: "",
    transmissionPassword: "",
    pyloadUrl: "http://pyload:8000",
    pyloadUsername: "pyload",
    pyloadPassword: "pyload",
    jwtSecret: "amule-middleware-change-this-secret",
    downloadsDir: "",
    amuleConfigDir: "",
  },
});
