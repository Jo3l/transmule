<div align="center">
  <img src="./frontend/assets/logo/logo320.png" alt="TransMule Logo" width="128" height="128">

  # TransMule — Unified Self-Hosted Download Manager

  <p align="center">
    <strong>One dashboard to manage aMule (ED2K/Kademlia), Transmission (BitTorrent) and pyLoad NG (direct downloads)</strong>
  </p>

  <p align="center">
    <a href="https://github.com/Jo3l/transmule/releases"><img src="https://img.shields.io/github/v/release/Jo3l/transmule?style=flat&logo=github&label=Release" alt="Release"></a>
    <a href="https://github.com/Jo3l/transmule/stargazers"><img src="https://img.shields.io/github/stars/Jo3l/transmule?style=flat&logo=github&label=Stars" alt="Stars"></a>
    <a href="https://github.com/Jo3l/transmule/actions/workflows/docker-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/Jo3l/transmule/docker-publish.yml?style=flat&logo=githubactions&label=Build" alt="Build Status"></a>
    <a href="https://github.com/Jo3l/transmule/pkgs/container/transmule"><img src="https://img.shields.io/badge/docker-ghcr.io%2Fjo3l%2Ftransmule-blue?style=flat&logo=docker&label=Image" alt="Docker Image"></a>
    <a href="https://github.com/Jo3l/transmule/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Jo3l/transmule?style=flat&label=License" alt="License"></a>
    <a href="https://github.com/Jo3l/transmule/issues"><img src="https://img.shields.io/github/issues/Jo3l/transmule?style=flat&logo=github&label=Issues" alt="Issues"></a>
  </p>

  <p align="center">
    <a href="#-features">Features</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-screenshots">Screenshots</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-plugin-system">Plugins</a> •
    <a href="#-comparison">Comparison</a> •
    <a href="#-environment-variables">Configuration</a> •
    <a href="#-development">Development</a> •
    <a href="#-faq--troubleshooting">FAQ</a>
  </p>

  <p align="center">
    🌐 <strong>English</strong> • Español • Italiano
  </p>

  <img src="./transmuleDownloads.jpg" alt="TransMule — Unified download manager dashboard showing aMule, Transmission and pyLoad downloads" width="100%">
  <br><em>TransMule dashboard — unified view of all your downloads</em>
</div>

<br>

---

> **TransMule** is a modern, self-hosted web interface that unifies three download ecosystems — **aMule** (ED2K/Kademlia), **Transmission** (BitTorrent) and **pyLoad NG** (direct/one-click hosting) — into a single dashboard. Deployed via Docker Compose, it works on any architecture (x86_64 and ARM64) and includes a built-in file manager with remote storage mounts, media preview, archive utilities, extensible plugin system, multi-user auth, and full i18n support. All in one container with a single `docker compose up -d`.

<br>

## ✨ Features

### 📥 Unified Download Management
| Feature | Description |
|---------|-------------|
| **Unified dashboard** | All downloads — aMule files, BitTorrent transfers and pyLoad packages — in one sortable, filterable table with mobile card layout |
| **aMule integration** | Browse and search the ED2K/Kademlia network, manage downloads, view chunk availability, sources, friends, connected servers, KAD status and full preferences |
| **Transmission integration** | Add torrents via magnet link or URL, control downloads, inspect peers/trackers/files, configure network and speed limits |
| **pyLoad NG integration** | Add direct-download (DDL) packages, monitor link extraction status, stop/restart/delete packages with full queue management |
| **Torrent search** | Search multiple torrent indexes directly from the UI with live streaming results — extensible via plugins |

### 🗂️ File Management & Storage
| Feature | Description |
|---------|-------------|
| **Full file manager** | Browse, upload, download, rename, delete, move and copy files through a clean web interface |
| **Remote mounts** | Mount **SMB/CIFS** and **WebDAV** shares and manage remote files transparently as if they were local |
| **Extensible mount system** | Provider-agnostic architecture — adding new protocols (SFTP, NFS, S3, …) only requires implementing a small interface |
| **Archive utilities** | Compress files into zip/tar/tar.gz/tar.bz2/tar.xz (with optional password for zip), extract uploaded archives, smart rename media files |
| **Media preview** | In-browser image viewer, video player with streaming, and text editor for quick inspection |

### 🔌 Plugin System
| Feature | Description |
|---------|-------------|
| **Runtime plugins** | Upload `.js` plugins without restarting the server — they're active immediately after refresh |
| **Media providers** | Add sidebar browse/search for movies, shows, and more (YTS, DonTorrent, ShowRSS, etc.) |
| **Torrent search sources** | Add custom torrent indexers (PirateBay, YTS Search, Nyaa.si, TorrentClaw, etc.) |
| **Official plugins** | Maintained in [transmule-plugins](https://github.com/Jo3l/transmule-plugins) with a public manifest |

### 👥 User Experience
| Feature | Description |
|---------|-------------|
| **Multi-user auth** | JWT-based login with per-user preferences stored in SQLite |
| **Light / Dark themes** | Full theme support that respects system preference |
| **🌐 i18n** | English, Spanish and Italian — with translation framework for more |
| **📱 Mobile-friendly** | Responsive layout with card-based view on small screens |
| **Statistics** | Live aMule stats tree + Transmission session statistics |
| **API documentation** | Interactive Swagger docs at [`/_scalar`](http://localhost:3001/_scalar) |

<br>

## 🚀 Quick Start

### Prerequisites
- **Docker** and **Docker Compose** (v2 or later) installed
- At least one of: aMule with EC enabled, Transmission with RPC enabled, pyLoad NG running

### 1. Clone and configure

```bash
git clone https://github.com/Jo3l/transmule.git
cd transmule
cp .env.example .env
```

Edit `.env` — at minimum set your aMule EC password and a JWT secret:

```env
AMULE_GUI_PASSWORD=your_amule_password
JWT_SECRET=change-this-to-a-long-random-string
PYLOAD_USER=pyload
PYLOAD_PASSWORD=pyload
```

### 2. Start all services

```bash
docker compose up -d
```

This starts four containers:
- **app** — TransMule UI + API (nginx + Nitro, single container via supervisord)
- **amule** — aMule daemon (ED2K/Kademlia)
- **transmission** — BitTorrent client
- **pyload** — Direct download manager

### 3. Open the dashboard

| URL | What you get |
|-----|--------------|
| [http://localhost:3001](http://localhost:3001) | TransMule dashboard |
| [http://localhost:3001/_scalar](http://localhost:3001/_scalar) | Interactive API docs |

On first run you will be prompted to create an admin account.

### 🍓 ARM64 / Raspberry Pi

The `docker-compose.yml` is fully ARM64-compatible. The TransMule image is published as a **multi-arch manifest** supporting both `linux/amd64` and `linux/arm64`. All service images are also multi-arch — no special configuration needed.

If you need to pin specific tags:

```env
TRANSMULE_APP_IMAGE=ghcr.io/jo3l/transmule:latest
AMULE_IMAGE=ngosang/amule:latest
TRANSMISSION_IMAGE=lscr.io/linuxserver/transmission:latest
PYLOAD_IMAGE=lscr.io/linuxserver/pyload-ng:latest
```

<br>

## 📸 Screenshots

| View | Desktop | Mobile |
|------|---------|--------|
| **Downloads** | ![Downloads](transmuleDownloads.jpg) | _Responsive card layout_ |
| **Torrent Search** | _Streaming search results with provider tabs_ | _Search on the go_ |
| **File Manager** | _Browse, upload, manage files_ | _Touch-friendly_ |
| **Settings** | _Providers, integrations, preferences_ | _Full mobile support_ |

> Screenshots will be added in a dedicated [`docs/screenshots/`](docs/screenshots/) directory. Contributions welcome!

<br>

## 🏗️ Architecture

```
Browser
  │
  └─ transmule-app (port 3001)
        │  nginx — serves Nuxt SPA (static files)
        │        — proxies /api/* and /_scalar → 127.0.0.1:3000
        │
        └─ Nitro API (127.0.0.1:3000, loopback only)
              ├─ JWT auth + user management (SQLite via better-sqlite3)
              ├─ CORS handling
              ├─► aMule EC protocol      (internal :4712)
              ├─► Transmission RPC       (internal :9091)
              └─► pyLoad NG API          (internal :8000)
```

The frontend (Nuxt 3 SPA) and the Nitro API share a single container managed by supervisord. nginx handles static file serving and proxies API traffic to Nitro on the loopback interface — no IP address is ever baked into the image.

### Container topology

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  transmule-  │     │  transmule-      │     │  transmule-   │
│  app         │────▶│  transmission    │     │  pyload       │
│  (nginx+Nitro)│     │  (BitTorrent)    │     │  (direct DL)  │
│  :3001       │     │  :9091 (internal)│     │  :8000 (int.) │
└──────┬───────┘     └──────────────────┘     └───────────────┘
       │
       ▼
┌──────────────┐
│  transmule-  │
│  amule       │
│  (ED2K/KAD)  │
│  :4712 (int.)│
└──────────────┘
```

**All inter-service communication** happens on an internal Docker network. aMule EC, Transmission RPC and pyLoad API are never exposed to the host. The Nitro API listens on `127.0.0.1:3000` inside the app container exclusively.

<br>

## 🧩 Plugin System

TransMule has a **runtime plugin system** in JavaScript. Upload a `.js` file via **Settings → Providers** and it's active immediately after page reload — no server restart needed.

### Plugin types

| Type | Purpose | Examples |
|------|---------|----------|
| **Media** (`mediaType`) | Sidebar browse/search for content types (movies, shows, anime) | YTS, DonTorrent, ShowRSS, TorrentClaw Popular |
| **Torrent Search** (`pluginType: \"torrent-search\"`) | Custom index source for the torrent search page | PirateBay, YTS Search, Nyaa.si, TorrentClaw |

### Official plugins

| Plugin | Type | Description |
|--------|------|-------------|
| `yts` | movies | Movie browse/search via YTS.mx with quality & genre filters |
| `dontorrent-movies` | movies | Spanish movie torrents from dontorrent.link |
| `dontorrent-shows` | shows | Spanish series torrents from dontorrent.link |
| `showrss` | shows | TV show torrents from your personal ShowRSS RSS feed |
| `torrentclaw-popular` | movies / shows | Popular torrents from TorrentClaw with metadata |
| `nyaa` | torrent-search | Anime & manga torrents via nyaa.si |
| `piratebay` | torrent-search | General torrents via apibay.org JSON API |
| `yts-search` | torrent-search | Movie torrents via YTS.mx JSON API |
| `torrentclaw` | torrent-search | Torrent search via TorrentClaw API with quality scores |

> Download from [github.com/Jo3l/transmule-plugins](https://github.com/Jo3l/transmule-plugins)

### Smart tags

Search results include color-coded badges for quick scanning:

| Tag | Color | Examples |
|-----|-------|----------|
| Quality score | 🟢 success | `83`, `95` |
| Resolution | 🟡 warning | `2160P`, `1080P`, `720P` |
| HDR type | 🟡 warning | `DV+HDR10`, `HDR10`, `HLG` |
| Source | 🔵 info | `BLURAY`, `WEB-DL`, `HDTV` |
| Codec | 🔵 info | `hevc`, `x265`, `AV1` |
| Audio | 🟣 accent | `TRUEHD 7.1`, `DTS-HD MA` |
| Language | ⚪ default | `🇬🇧 EN`, `🇪🇸 ES`, `🇯🇵 JP` |
| Flags | 🔴 danger | `PROPER`, `REPACK`, `INTERNAL` |

Tags come from two sources: **native** (returned by the plugin with structured metadata) and **parsed** (extracted from the torrent name via regex in `parse-name.ts` — applied to all plugins).

<br>

## 📊 Comparison

| Feature | TransMule | aMuTorrent |
|---------|-----------|------------|
| **aMule (ED2K/KAD)** | ✅ Full EC protocol — downloads, search, servers, KAD, stats | ✅ aMule EC |
| **Transmission** | ✅ Full RPC — torrents, peers, trackers, settings | ✅ Transmission RPC |
| **qBittorrent** | ❌ | ✅ WebUI API |
| **rTorrent** | ❌ | ✅ XML-RPC |
| **Deluge** | ❌ | ✅ JSON-RPC |
| **pyLoad (direct downloads)** | ✅ Full integration | ❌ |
| **Multi-instance clients** | ❌ | ✅ |
| **File manager** | ✅ Built-in with browse, upload, download, rename, delete, move, copy | ❌ |
| **Remote storage mounts** | ✅ SMB/CIFS + WebDAV (extensible) | ❌ |
| **Archive utilities** | ✅ Compress (zip/tar.gz/tar.xz) + extract + smart rename | ❌ |
| **Media preview** | ✅ Image viewer, video player, text editor | ❌ |
| **Plugin system** | ✅ Runtime JS plugins (media + torrent-search) | ❌ |
| **Torrent search** | ✅ Streaming SSE with provider tabs | ✅ Prowlarr search |
| **Prowlarr integration** | ❌ (custom plugin system instead) | ✅ |
| **Torznab / *arr API** | ❌ | ✅ Sonarr/Radarr-compatible for aMule |
| **Push notifications** | ❌ (planned) | ✅ Apprise (80+ services) |
| **GeoIP peers** | ❌ | ✅ |
| **Multi-user auth** | ✅ JWT-based, per-user prefs | ✅ Users, capabilities, SSO |
| **i18n** | ✅ English, Spanish, Italian | ❌ (English only) |
| **Theming** | ✅ Light / Dark (system-aware) | ✅ Dark mode |
| **Mobile support** | ✅ Responsive design + card layout | ✅ Responsive |
| **Docker deployment** | ✅ Single docker-compose.yml, all-in-one | ✅ Docker image |
| **Multi-arch images** | ✅ amd64 + ARM64 | ✅ amd64 + ARM64 |
| **API docs** | ✅ Interactive Swagger at `/_scalar` | ✅ REST API + WebSocket docs |
| **WebSocket / real-time** | ❌ (polling + SSE) | ✅ WebSocket |

> TransMule focuses on **depth over breadth**: fewer supported clients, but richer built-in file management, storage mounts, media preview, archive tools, and an extensible plugin system that doesn't require external services.

<br>

## 📁 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | [Nuxt 3](https://nuxt.com/) + Vue 3, custom SCSS, i18n via `@nuxtjs/i18n` |
| **Middleware** | [Nitro](https://nitro.unjs.io/) (Node.js HTTP server) |
| **Database** | SQLite via `better-sqlite3` |
| **Auth** | JWT (`jose` on frontend, `jsonwebtoken` on middleware) — cookie transport |
| **aMule client** | EC binary protocol (custom implementation via `amule-ec-client`) |
| **Transmission** | Transmission RPC JSON API |
| **pyLoad** | pyLoad NG HTTP API |
| **SMB client** | [`@marsaud/smb2`](https://www.npmjs.com/package/@marsaud/smb2) |
| **WebDAV client** | [`webdav`](https://www.npmjs.com/package/webdav) |
| **Background jobs** | In-process job queue (transfers, extracts, compressions via `/api/files/transfer-status`) |
| **Containers** | Docker Compose — multi-arch (amd64 + arm64), multi-stage Dockerfile |
| **CI/CD** | GitHub Actions → GHCR (`ghcr.io/jo3l/transmule`) |

<br>

## 🔌 Ports

| Port | Service | Note |
|------|---------|------|
| `3001` | App (nginx + Nitro) | UI + proxied API + Swagger (`/_scalar`) |
| `16881` (TCP) | aMule ED2K | Configurable via `AMULE_ED2K_TCP_PORT` |
| `16882` (UDP) | aMule ED2K | Configurable via `AMULE_ED2K_UDP_PORT` |
| `16883` (UDP) | aMule Kademlia | Configurable via `AMULE_KAD_UDP_PORT` |
| `16884` (TCP/UDP) | Transmission peers | Configurable via `TRANSMISSION_PEER_PORT` |

**Internal only** (Docker network, not exposed to host):
- `4712` — aMule EC protocol
- `9091` — Transmission RPC
- `8000` — pyLoad web UI + API
- `3000` — Nitro API (loopback inside app container)

<br>

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PUID` / `PGID` | `1000` | Host user/group IDs for file permissions |
| `TZ` | `Europe/Madrid` | Timezone |
| `DOWNLOAD_DIR` | `./downloads` | Completed downloads host path |
| `INCOMPLETE_DIR` | `./incomplete` | In-progress downloads host path |
| `DATA_DIR` | `./data` | Middleware SQLite database directory |
| `AMULE_GUI_PASSWORD` | — | aMule EC protocol password (port 4712) |
| `TRANSMISSION_USER` / `TRANSMISSION_PASS` | _(empty)_ | Transmission RPC credentials |
| `JWT_SECRET` | `change-me` | Secret for signing JWT tokens (auto-generated if empty) |
| `PYLOAD_USER` / `PYLOAD_PASSWORD` | `pyload` | pyLoad NG credentials |
| `TRANSMULE_APP_IMAGE` | `ghcr.io/jo3l/transmule:latest` | Optional app image override |
| `AMULE_IMAGE` | `ngosang/amule:latest` | Optional aMule image override |
| `TRANSMISSION_IMAGE` | `lscr.io/linuxserver/transmission:latest` | Optional Transmission image override |
| `PYLOAD_IMAGE` | `lscr.io/linuxserver/pyload-ng:latest` | Optional pyLoad image override |
| `TMDB_API_KEY` | — | TMDB API key for cover artwork |
| `TVDB_API_KEY` | — | TVDB API key for cover artwork (fallback) |

<br>

## 🛠️ Development

### Requirements
- Node.js 20+
- Docker (for back-end services: aMule, Transmission, pyLoad)

### Setup

```bash
# Start back-end services only
docker compose -f docker-compose.dev.yml up -d

# Middleware (hot-reload)
cd middleware && npm install && npm run dev

# Frontend (hot-reload)
cd frontend && npm install && npm run dev
```

Or use the convenience script at the root:

```bash
./dev.sh
```

### Building the Docker image

```bash
docker build -t transmule:dev .
```

### Project structure

```
transmule/
├── frontend/          # Nuxt 3 SPA (Vue 3)
│   ├── components/    # Vue components
│   ├── composables/   # Shared composables (useSearchTabs, etc.)
│   ├── pages/         # Route pages
│   └── assets/        # Styles, logos, static assets
├── middleware/        # Nitro API server
│   ├── server/
│   │   ├── api/       # REST endpoints
│   │   ├── providers/ # Plugin loader + types
│   │   ├── torrent-search/ # Torrent search engine
│   │   └── utils/     # Auth, SMB, WebDAV helpers
│   └── ...
├── data/              # SQLite DB + runtime plugins
├── docker/            # Init scripts for Docker services
├── .github/workflows/ # CI/CD — builds to GHCR
├── Dockerfile         # Multi-stage build
├── docker-compose.yml # Production
├── docker-compose.dev.yml # Development
└── .env.example       # Configuration template
```

<br>

## ❓ FAQ & Troubleshooting

### "Can't connect to aMule"
- Verify EC is enabled in aMule: Preferences → Remote Controls → External Connections
- Check the EC password matches `AMULE_GUI_PASSWORD` in `.env`
- Ensure the aMule container is running: `docker compose ps`

### "Can't connect to Transmission"
- Verify RPC is accessible: `curl http://host:9091/transmission/rpc` (a `409` response means RPC is working)
- If RPC auth is enabled, set `TRANSMISSION_USER` and `TRANSMISSION_PASS` in `.env`

### "Can't connect to pyLoad"
- Verify the pyLoad container is running
- Default credentials are `pyload` / `pyload` — configure via `PYLOAD_USER` / `PYLOAD_PASSWORD`

### "Port 3001 is already in use"
- Change the host port in `docker-compose.yml` under `app.ports` (e.g. `"4000:3001"`)

### "File permission errors"
- Ensure `PUID` and `PGID` in `.env` match your host user's IDs
- Run `id` on the host to check: `id -u` (UID), `id -g` (GID)

### "How do I add a torrent?"
- Go to **Transmission → Torrent Search** in the sidebar
- Search, select results, and click the download button — the torrent is sent directly to Transmission

### "How do I update TransMule?"
```bash
docker compose pull app
docker compose up -d app
```

### "Where are my downloads stored?"
- Completed downloads → `./downloads/` (on the host)
- In-progress downloads → `./incomplete/` (on the host)
- These paths are configurable via `DOWNLOAD_DIR` and `INCOMPLETE_DIR` in `.env`

### "Can I access the API directly?"
Yes! The Nitro API is proxied through nginx at `http://localhost:3001/api/...`. Interactive documentation is available at [`http://localhost:3001/_scalar`](http://localhost:3001/_scalar).

<br>

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

- **Report bugs** — open a [GitHub Issue](https://github.com/Jo3l/transmule/issues)
- **Submit plugins** — add your plugin to [transmule-plugins](https://github.com/Jo3l/transmule-plugins)
- **Translate** — help add more languages via the i18n framework
- **Feature requests** — open a discussion or issue
- **Code** — PRs are always welcome

> This is an AI-assisted project: parts of the code and documentation were developed with AI tooling and reviewed by the maintainer.

<br>

## 📜 License

[GNU General Public License v3.0](LICENSE) — see the [LICENSE](LICENSE) file for details.

<br>

---

<div align="center">
  <a href="https://github.com/Jo3l/transmule">GitHub</a> •
  <a href="http://localhost:3001/_scalar">API Docs</a> •
  <a href="https://github.com/Jo3l/transmule-plugins">Plugins</a> •
  <a href="https://github.com/Jo3l/transmule/issues">Issues</a>

  <br><br>
  <sub>Built with ❤️ by <a href="https://github.com/Jo3l">Jo3l</a></sub>
</div>
