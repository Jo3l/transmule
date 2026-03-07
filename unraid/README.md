# TransMule — Unraid Installation

Deploy TransMule on Unraid using the **Compose Manager** plugin.

---

## Prerequisites

1. **Community Applications** plugin installed on Unraid.
2. **Compose Manager** plugin — install it from Community Apps (search "Compose Manager").
   > ⚠️ Without this plugin, neither `docker compose` nor `docker-compose` will be available in the Unraid terminal.
3. The image is hosted on **GitHub Container Registry** and pulled automatically:
   - `ghcr.io/jo3l/transmule:latest`
   - No Docker Hub account or login required.

---

## Installation

### 1. Run the setup script

Open an Unraid terminal and paste this one-liner:

```bash
mkdir -p /boot/config/plugins/compose.manager/projects/transmule
cd /boot/config/plugins/compose.manager/projects/transmule
wget -qO- https://raw.githubusercontent.com/Jo3l/transmule/main/unraid/setup.sh | sh
```

The script will:

- Download the latest `docker-compose.yml` and `.env.example` from GitHub
- Create `.env` with random values for `AMULE_GUI_PASSWORD` and `JWT_SECRET`
- Create the aMule entrypoint wrapper in your appdata directory

> **Re-running is safe.** If `.env` already exists its secrets are preserved. `docker-compose.yml` is always refreshed to the latest version.

> **Manual passwords:** Edit `.env` after running the script if you want to set your own values.

### 2. Start the stack

**Recommended — via Compose Manager UI:**

In the Unraid web UI:

- Go to **Docker** → **Compose Manager**.
- Click the **transmule** project → **Up** (or **Compose Up**).

**Alternative — via terminal** (requires Compose Manager plugin to be installed first, which adds the `docker compose` command):

```bash
cd /boot/config/plugins/compose.manager/projects/transmule
docker compose up -d
```

---

## Accessing TransMule

| Service      | URL                                  |
| ------------ | ------------------------------------ |
| **Web UI**   | `http://YOUR_UNRAID_IP:3001`         |
| **API Docs** | `http://YOUR_UNRAID_IP:3001/_scalar` |

On first access you will be prompted to create an admin account.

---

## Ports

| Host port    | Service            |
| ------------ | ------------------ |
| `3001`       | Web UI + API       |
| `4662` (TCP) | aMule ED2K         |
| `4672` (UDP) | aMule ED2K         |
| `4665` (UDP) | aMule Kademlia     |
| `51413`      | Transmission peers |

All ports are configurable via `.env`. The Nitro API runs on port 3000 **inside** the container (loopback only) and is not exposed to the host — nginx proxies requests to it.

---

## Data locations

| Container data         | Host path                                  |
| ---------------------- | ------------------------------------------ |
| aMule config           | `/mnt/user/appdata/transmule/amule`        |
| Transmission config    | `/mnt/user/appdata/transmule/transmission` |
| pyLoad config          | `/mnt/user/appdata/transmule/pyload`       |
| Middleware DB (SQLite) | `/mnt/user/appdata/transmule/data`         |
| Downloads              | `/mnt/user/downloads`                      |
| Incomplete downloads   | `/mnt/user/incomplete`                     |

All paths are configurable via `APPDATA_DIR`, `DOWNLOAD_DIR`, `INCOMPLETE_DIR` in `.env`.

---

## Building & publishing images

The app image is hosted on **GitHub Container Registry** (ghcr.io) and built automatically
by GitHub Actions whenever a new version is pushed.
No Docker Hub account or extra secrets needed — it uses the built-in `GITHUB_TOKEN`.

**GitHub Actions** runs automatically on every push with a version tag.
The workflow is at `.github/workflows/docker-publish.yml`.

To build and push manually (from the repository root):

```bash
docker build -t ghcr.io/jo3l/transmule:latest .
docker push ghcr.io/jo3l/transmule:latest
```

> **No IP configuration needed.** nginx inside the container proxies all
> `/api/*` and `/_scalar` requests to Nitro running on loopback. The image
> works regardless of your server's IP address or hostname.

---

## Updating

Via Compose Manager UI: **Docker → Compose Manager → transmule → Pull** then **Up**.

Or from the terminal (after Compose Manager plugin is installed):

```bash
cd /boot/config/plugins/compose.manager/projects/transmule
docker-compose pull && docker-compose up -d
```
