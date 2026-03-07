# TransMule

A unified self-hosted web interface for managing downloads across **aMule** (ED2K/Kademlia), **Transmission** (torrents) and **pyLoad NG** (direct downloads) — all from a single dashboard, deployed with Docker Compose.

---

## Features

- **Unified downloads view** — aMule files, torrents and pyLoad packages in one table (or mobile card layout on small screens)
- **aMule** — browse/search the ED2K network, manage downloads, view chunk availability, sources, friends, servers, KAD status and preferences
- **Transmission** — add torrents via magnet/URL, control downloads, inspect peers/trackers/files, manage network and speed settings
- **pyLoad NG** — add direct-download packages, monitor link status, stop/restart/delete packages
- **Torrent search** — search Nyaa, The Pirate Bay and YTS from within the UI
- **Statistics** — live aMule stats tree and Transmission session stats
- **Multi-user auth** — JWT-based login, per-user preferences
- **Theming** — light / dark mode
- **i18n** — English, Spanish, Italian
- **Mobile-friendly** — responsive layout with card view on small screens

---

## Architecture

```
Browser
  │
  └─ transmule-app (port 3001)
        │  nginx — serves Nuxt SPA
        │        — proxies /api/* and /_scalar → 127.0.0.1:3000
        │
        └─ Nitro API (127.0.0.1:3000, loopback only)
              ├─ JWT auth + user management (SQLite)
              ├─ CORS handling
              ├─► aMule EC protocol      (internal :4712)
              ├─► Transmission RPC      (internal :9091)
              └─► pyLoad NG API         (internal :8000)
```

The frontend SPA and the Nitro API share a single container managed by
supervisord. nginx handles static file serving and proxies API traffic to Nitro
on the loopback interface — no IP address is ever baked into the image.

---

## Quick Start

### 1. Clone and configure

```bash
git clone git@github.com:Jo3l/transmule.git
cd transmule
cp .env.example .env
```

Edit `.env` — at minimum set your passwords and file paths:

```env
AMULE_GUI_PASSWORD=your_amule_password
JWT_SECRET=a-long-random-string
PYLOAD_USER=pyload
PYLOAD_PASSWORD=pyload
```

### 2. Start

```bash
docker compose up -d
```

> **Image not found / access denied?** On the first push, ghcr.io packages default to **private**.
> To make it public: GitHub repo → **Packages** → **transmule** → **Package settings** → change visibility to **Public**.

### 3. Open

- **Frontend / API:** http://localhost:3001
- **Swagger docs:** [http://localhost:3001/\_scalar](http://localhost:3001/_scalar)

On first run you will be prompted to create an admin account.

---

## Ports

| Port         | Service             | Note                                      |
| ------------ | ------------------- | ----------------------------------------- |
| `3001`       | App (nginx + Nitro) | UI + proxied API + Swagger (`/_scalar`)   |
| `4662` (TCP) | aMule ED2K          | Configurable via `AMULE_ED2K_TCP_PORT`    |
| `4672` (UDP) | aMule ED2K          | Configurable via `AMULE_ED2K_UDP_PORT`    |
| `4665` (UDP) | aMule Kademlia      | Configurable via `AMULE_KAD_UDP_PORT`     |
| `51413`      | Transmission peers  | Configurable via `TRANSMISSION_PEER_PORT` |

All service-to-service communication (aMule EC, Transmission RPC, pyLoad API) happens on the internal Docker network and is **not** exposed to the host. Nitro listens on `127.0.0.1:3000` inside the app container and is not exposed externally.

---

## Environment Variables

| Variable                                  | Default         | Description                              |
| ----------------------------------------- | --------------- | ---------------------------------------- |
| `PUID` / `PGID`                           | `1000`          | Host user/group IDs for file permissions |
| `TZ`                                      | `Europe/Madrid` | Timezone                                 |
| `DOWNLOAD_DIR`                            | `./downloads`   | Completed downloads host path            |
| `INCOMPLETE_DIR`                          | `./incomplete`  | In-progress downloads host path          |
| `AMULE_GUI_PASSWORD`                      | —               | aMule EC protocol password (port 4712)   |
| `TRANSMISSION_USER` / `TRANSMISSION_PASS` | _(empty)_       | Transmission RPC credentials             |
| `DATA_DIR`                                | `./data`        | Middleware SQLite database directory     |
| `JWT_SECRET`                              | `change-me`     | Secret for signing JWT tokens            |
| `PYLOAD_USER` / `PYLOAD_PASSWORD`         | `pyload`        | pyLoad NG credentials                    |

---

## Development

Requirements: Node.js 20+, Docker (for the back-end services).

```bash
# Start back-end services only (aMule, Transmission, pyLoad)
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

---

## Tech Stack

| Layer               | Technology                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend            | [Nuxt 3](https://nuxt.com/) + Vue 3, custom SCSS                                                                                           |
| Middleware          | [Nitro](https://nitro.unjs.io/) (Node.js)                                                                                                  |
| Database            | SQLite via `better-sqlite3`                                                                                                                |
| Auth                | JWT (jose)                                                                                                                                 |
| aMule client        | EC binary protocol (custom implementation)                                                                                                 |
| Transmission client | Transmission RPC JSON API                                                                                                                  |
| pyLoad client       | pyLoad NG HTTP API                                                                                                                         |
| Containers          | Docker Compose — `ngosang/amule`, `linuxserver/transmission`, `linuxserver/pyload-ng` + combined app image (nginx + Nitro via supervisord) |
