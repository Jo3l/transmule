# TransMule — Unraid Installation

Deploy TransMule on Unraid using the **Compose Manager** plugin.

---

## Prerequisites

1. **Community Applications** plugin installed on Unraid.
2. **Compose Manager** plugin — install it from Community Apps (search "Compose Manager").
3. The custom Docker image published to Docker Hub:
   - `enriquito/transmule:latest`

   See [Building & publishing images](#building--publishing-images) below if you need to build it.

---

## Installation

### 1. Copy files to Unraid

On your Unraid server, place both files in:

```
/boot/config/plugins/compose.manager/projects/transmule/
```

You can use the Unraid terminal or transfer via SMB/SFTP:

```bash
mkdir -p /boot/config/plugins/compose.manager/projects/transmule
# copy docker-compose.yml and .env.example into that directory
cp .env.example .env
```

### 2. Edit `.env`

At minimum, change these values:

```env
AMULE_GUI_PASSWORD=a-strong-password
JWT_SECRET=a-long-random-string
```

### 3. Start the stack

In the Unraid web UI:

- Go to **Docker** → **Compose Manager**.
- Click the **transmule** project → **Up** (or **Compose Up**).

Alternatively, from the Unraid terminal:

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
| Downloads              | `/mnt/user/downloads/transmule`            |
| Incomplete downloads   | `/mnt/user/incomplete/transmule`           |

All paths are configurable via `APPDATA_DIR`, `DOWNLOAD_DIR`, `INCOMPLETE_DIR` in `.env`.

---

## Building & publishing images

The app image must be built and pushed to Docker Hub before Unraid can pull it.
A GitHub Actions workflow is included at `.github/workflows/docker-publish.yml`.

**GitHub Actions** — add two secrets to your repository
(`Settings → Secrets → Actions`):

| Secret               | Value                     |
| -------------------- | ------------------------- |
| `DOCKERHUB_USERNAME` | your Docker Hub username  |
| `DOCKERHUB_TOKEN`    | a Docker Hub access token |

Push to `main` and the workflow will build and push `enriquito/transmule:latest` automatically.

To build and push manually (from the repository root):

```bash
docker build -t enriquito/transmule:latest .
docker push enriquito/transmule:latest
```

> **No IP configuration needed.** nginx inside the container proxies all
> `/api/*` and `/_scalar` requests to Nitro running on loopback. The image
> works regardless of your server's IP address or hostname.

---

## Updating

```bash
cd /boot/config/plugins/compose.manager/projects/transmule
docker compose pull
docker compose up -d
```
