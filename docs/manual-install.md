# Manual installation — TransMule without `install.sh`

TransMule is a five-container Docker Compose stack. `install.sh` is only a convenience: it
detects the platform, writes the `.env`, picks free ports, creates the folders and applies a
one-time service configuration. **None of that is magic and none of it is required** — this
page does the same work by hand, in the same order.

Read this if you would rather know exactly what runs on your host: NAS owners who paste files
into a UI, people auditing the stack, or anyone who does not pipe a remote script into a shell.

Everything here is pinned to a **release tag**. Replace `v1.182` with the tag you want from
<https://github.com/Jo3l/transmule/tags>; `main` always tracks development and is not a stable
target.

## What the installer does — and what you do instead

| `install.sh` | Here |
| --- | --- |
| Checks Docker >= 20.10 and Compose >= 2.0 | [Step 0](#0-prerequisites) — `docker version`, `docker compose version` |
| Picks platform defaults (Unraid/Synology/paths) | [Step 2](#2-download-the-two-files) — you choose the paths |
| Picks free host ports | [Step 3](#3-write-the-env) — check them yourself |
| Generates `JWT_SECRET` and `AMULE_GUI_PASSWORD` | [Step 3](#3-write-the-env) — `openssl rand` |
| Creates download/data folders with host ownership | [Step 4](#4-create-the-host-folders) — `mkdir -p` |
| `pull` + `up -d` + wait for the API | [Step 5](#5-start-the-stack) |
| One-time aMule/Transmission configuration | [Step 6](#6-optional-the-one-time-service-configuration) — optional, and only needed in specific cases |
| Prints the post-install checklist | [Step 8](#8-post-install-checklist) |

## 0. Prerequisites

- Docker **20.10+** (`host-gateway` in `extra_hosts`) and Docker Compose **v2**.
- A normal user with access to the Docker daemon. Do not install as root: the containers write
  files as `PUID`/`PGID` and root-owned downloads are painful to fix later.
- Host ports free: `3001` (web UI), `4662`/tcp and `4672`/udp (eD2K + Kad), `51413`/tcp+udp
  (BitTorrent), `50300`/tcp (Soulseek).
- `curl` (or `wget`), `tar`, `openssl`, and `docker compose` for the commands below.

```bash
docker --version           # 20.10 or newer
docker compose version     # v2.x
docker info >/dev/null && echo "daemon reachable"
```

## 1. Pick a release

```bash
REL=v1.182
BASE="https://raw.githubusercontent.com/Jo3l/transmule/$REL"
```

Two files matter, both published at the tag: `docker-compose.yml` and `.env.example`. Nothing
else from the repository is needed at runtime — the compose file mounts no host-side helper
scripts, so what you download is all that ever runs.

## 2. Download the two files

```bash
mkdir -p ~/transmule && cd ~/transmule
curl -fsSLO "$BASE/docker-compose.yml"
curl -fsSLo .env "$BASE/.env.example"
```

`.env.example` is the template for `.env`; it ships with working defaults and no real secrets.

If you want a second source to compare against (the tag as a checkout, not a raw file):

```bash
git clone --depth 1 --branch "$REL" https://github.com/Jo3l/transmule.git /tmp/transmule-src
diff -u /tmp/transmule-src/docker-compose.yml docker-compose.yml
diff -u /tmp/transmule-src/.env.example .env
```

Both should print nothing. (This verifies you got the tag's content; it does not add a signature
that isn't there.)

### Read it

Worth ten minutes if you are about to expose this to a network:

- **Exposed to the host:** `3001` (app), `4662`/tcp + `4672`/udp (aMule), `51413`/tcp+udp
  (Transmission), `50300`/tcp (slskd). Everything else is `expose:`-only on the internal
  `transmule` bridge network: aMule EC `4712`, Transmission RPC `9091`, pyLoad `8000`,
  slskd `5030`. Nitro listens on `127.0.0.1:3000` inside the app container and never on the
  network.
- **Mounted from the host:** `DOWNLOAD_DIR`, `INCOMPLETE_DIR`, `DATA_DIR`, plus
  `/var/run/docker.sock` (read-only) so the app can show and start/stop the sibling containers.
  That socket is effectively root on the host — drop the volume if you don't want the Services
  page to work.
- **State that lives in named volumes:** `amule-config` (amule.conf), `transmission-config`
  (settings.json), `slskd-config`, `pyload-config`. Back these up together with `DATA_DIR`.

## 3. Write the `.env`

Change at least the user/group IDs, the timezone, the three paths and the two secrets.

```bash
tz="$(cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value 2>/dev/null || echo UTC)"

sed -i \
  -e "s|^PUID=.*|PUID=$(id -u)|" \
  -e "s|^PGID=.*|PGID=$(id -g)|" \
  -e "s|^TZ=.*|TZ=$tz|" \
  -e "s|^DOWNLOAD_DIR=.*|DOWNLOAD_DIR=$HOME/downloads|" \
  -e "s|^INCOMPLETE_DIR=.*|INCOMPLETE_DIR=$HOME/downloads/.incomplete|" \
  -e "s|^DATA_DIR=.*|DATA_DIR=$PWD/data|" \
  .env

sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^AMULE_GUI_PASSWORD=.*|AMULE_GUI_PASSWORD=$(openssl rand -hex 12)|" .env
chmod 600 .env
```

Absolute paths are recommended (Compose resolves relative ones against the compose file's
directory, which works but is easy to get wrong when you move the folder).

| Variable | What it is | What you should do |
| --- | --- | --- |
| `PUID` / `PGID` | UID/GID the containers write files as | Must match the user that owns the download folders. On Unraid: `99`/`100`. |
| `TZ` | Timezone for Transmission and pyLoad | Your zone, e.g. `Europe/Madrid`. |
| `DOWNLOAD_DIR`, `INCOMPLETE_DIR` | Host paths for finished and in-progress downloads | Absolute paths on a disk with room. |
| `DATA_DIR` | SQLite database + `.jwt_secret` | Back this up; it holds users, settings, integrations. |
| `TRANSMULE_PORT` | Host port of the web UI + API | Change it if `3001` is taken (it is the *host* side only). |
| `AMULE_ED2K_TCP_PORT`, `AMULE_ED2K_UDP_PORT` | Host ports for eD2K and Kad | Free them, or move them; container internals stay 4662/4672. |
| `TRANSMISSION_PEER_PORT` | Host port for BitTorrent peers | Free, or move it. |
| `SLSKD_P2P_PORT` | Host port for Soulseek P2P | Free, or move it. |
| `JWT_SECRET` | JWT signing key | Random. Leaving it **empty** is also fine: the app generates one on first start and keeps it in `DATA_DIR/.jwt_secret` (mode 0600). |
| `AMULE_GUI_PASSWORD` | aMule EC password (port 4712, internal only) | Replace it — `.env.example` ships a public sample value. |
| `TRANSMISSION_USER`/`PASS` | Transmission RPC credentials | Empty = RPC without auth, fine because RPC is internal-only. |
| `PYLOAD_USER`/`PASSWORD` | pyLoad API credentials | `pyload`/`pyload` are pyLoad's own defaults; if you change them in pyLoad's UI, change them here too. |
| `*_IMAGE` | Per-service image overrides | Pin them for reproducible upgrades: `TRANSMULE_APP_IMAGE=ghcr.io/jo3l/transmule@sha256:<digest>` (the digest comes from `docker buildx imagetools inspect ghcr.io/jo3l/transmule:latest`) or the `sha-<commit>` tag CI publishes. |
| `API_BASE_URL` | Development knob for `npm run dev` | Ignore it in a Compose install: the production image serves relative `/api` paths. |

Never reuse a `.env` across two hosts: two installs sharing a `JWT_SECRET` can mint tokens for
each other.

## 4. Create the host folders

Create them **before** the first `up`. Docker creates missing bind-mount paths as `root:root`,
and the containers run as `PUID`/`PGID` — the result is a stack that starts fine and then fails
to rename or move finished downloads.

```bash
mkdir -p "$HOME/downloads" "$HOME/downloads/.incomplete" "$PWD/data"
ls -ldn "$HOME/downloads" "$HOME/downloads/.incomplete" "$PWD/data"   # owned by your UID/GID
```

If the paths live on a NAS share, make sure they are real POSIX paths (`/mnt/user/...`,
`/volume1/...`) and not SMB mounts owned by somebody else.

## 5. Start the stack

```bash
docker compose config -q && echo "compose is valid"
docker compose pull
docker compose up -d
docker compose ps
```

Five containers come up: `transmule-app`, `transmule-amule`, `transmule-transmission`,
`transmule-slskd`, `transmule-pyload`.

Wait for the API (the same readiness signal the installer uses):

```bash
curl -fsS http://127.0.0.1:3001/api/users/status
# {"hasUsers":false}   <- no admin account yet
```

If it does not answer within a minute or two:

```bash
docker compose logs --tail 50 app
```

Then open `http://<host>:3001`. The first load asks you to create the admin account, and after
that a setup wizard walks through the remaining items (plugins, metadata keys, ports).

## 6. Optional: the one-time service configuration

`install.sh` changes two things on first boot that the images do not take from the environment.
Neither is required for a working install — this section explains what they are and how to
reproduce them, so nothing about the script stays unexplained.

### 6.1 Transmission: download folders

The `lscr.io/linuxserver/transmission` image starts with `download-dir=/downloads/complete` and
`incomplete-dir=/downloads/incomplete` (RPC is already enabled, bound to `0.0.0.0`, with the
whitelist off — that part needs no change). The installer flattens both to `/downloads` and
`/incomplete`, which is where TransMule expects them.

**Only edit this while Transmission is stopped** — the daemon rewrites `settings.json` when it
exits, so an edit made against a running container is lost on the next stop. Run every command
from the install folder: `docker compose run` reuses the project's own `transmission-config`
volume only from there.

```bash
# let it create /config/settings.json, then stop it so it saves its state
docker compose up -d transmission
docker compose stop transmission

docker compose run --rm --no-deps --entrypoint python3 transmission -c '
import json
p = "/config/settings.json"
cfg = json.load(open(p))
cfg.update({
    "download-dir": "/downloads",
    "incomplete-dir": "/incomplete",
    "incomplete-dir-enabled": True,
    "rpc-enabled": True,
    "rpc-bind-address": "0.0.0.0",
    "rpc-whitelist-enabled": False,
    "peer-port": 51413,
})
json.dump(cfg, open(p, "w"), indent=4, sort_keys=True)
print("patched")
'

docker compose start transmission
docker compose exec transmission grep -E '"download-dir"|"incomplete-dir"' /config/settings.json
```

Skip it and the stack still works: downloads land in `/downloads/complete` and
`/downloads/incomplete`, both visible in the file manager, and you can point Transmission at
other folders later from its own configuration.

### 6.2 aMule: internal ports

A **fresh** `amule-config` volume needs nothing: the image writes `Port=4662`, `UDPPort=4672`,
`IncomingDir=/downloads` and `TempDir=/incomplete` from its own environment.

Only if you are **reusing an old `amule-config` volume** whose `amule.conf` still carries the
legacy ports (`16881`/`16882`), align it once — again with the daemon stopped, because aMule
saves `amule.conf` on exit:

```bash
docker compose stop amule

docker compose run --rm --no-deps --entrypoint sh amule -c '
cd /home/amule/.aMule
sed -i -E "/^\[eMule\]/,/^\[/ s/^Port=.*/Port=4662/" amule.conf
sed -i -E "/^\[eMule\]/,/^\[/ s/^UDPPort=.*/UDPPort=4672/" amule.conf
sed -i -E "s|^IncomingDir=.*|IncomingDir=/downloads|; s|^TempDir=.*|TempDir=/incomplete|" amule.conf
'

docker compose start amule
```

The host side of the mapping comes from `.env` (`AMULE_ED2K_TCP_PORT`,
`AMULE_ED2K_UDP_PORT`); the container side is fixed at 4662/4672. Kad shares the UDP socket
with eD2K — there is no separate Kad port.

### 6.3 NAS users pasting into a UI

On Unraid (Docker Compose Manager) or Synology (Container Manager) you paste `docker-compose.yml`
and `.env` into the UI and press Up; there is no shell to run the steps above in. The Unraid
variant has its own walkthrough: [`docs/unraid-compose-manager.md`](unraid-compose-manager.md). That is a
supported path — you simply keep the images' default folders (the 6.1 change) and, with a new
volume, nothing else applies. TransMule's own setup wizard finishes the configuration from the
browser.

## 7. Verify

```bash
docker compose ps                                   # all five Up
curl -fsS http://127.0.0.1:3001/api/users/status    # {"hasUsers":true|false}
docker compose logs --tail 30 app                   # startup errors, if any
```

In the UI, on the dashboard:

- **aMule** — connects to a server and to Kad (`Connected` / `Kad: connected`). Without
  forwarded ports it still downloads, but in LowID and slowly.
- **Transmission** — session stats load, which means the middleware reached RPC.
- **slskd** — already has a generated Soulseek account; you can swap in your own at
  *slskd → Settings*.
- **pyLoad** — reachable with `pyload`/`pyload`.

## 8. Post-install checklist

- Forward the four P2P port groups on your router to this host, otherwise eD2K stays in LowID:
  `4662/tcp`, `4672/udp`, `51413/tcp+udp`, `50300/tcp`.
- **Settings → Ports** in the app checks whether they are actually reachable from outside.
- Optional keys under **Settings → Integrations**: TMDB and TVDB (planner metadata and
  artwork), Plex token (episode detection + library rescans).
- Set up backups of `DATA_DIR`, `DOWNLOAD_DIR` and the four named volumes.

## 9. Updating by hand

`.env`, `DATA_DIR` and the volumes survive an update; only the compose file is refreshed.

```bash
REL=v1.182                      # the release you are moving to
BASE="https://raw.githubusercontent.com/Jo3l/transmule/$REL"

curl -fsSLo docker-compose.yml.new "$BASE/docker-compose.yml"
diff -u docker-compose.yml docker-compose.yml.new   # review what changed
mv docker-compose.yml.new docker-compose.yml

docker compose pull
docker compose up -d
docker compose ps
```

If you pinned `TRANSMULE_APP_IMAGE` in `.env` (a digest or a `sha-…` tag), update it too —
otherwise `pull` keeps the old image.

There are no migrations to re-run: the service configuration from
[step 6](#6-optional-the-one-time-service-configuration) lives in the volumes and is applied
once, not on every start.

## 10. Stopping, removing, restoring

```bash
docker compose stop          # stop everything, keep containers
docker compose down          # remove containers and the network, keep volumes and files
docker compose down -v       # also delete the amule/transmission/slskd/pyload config volumes
```

`down -v` does **not** touch `DOWNLOAD_DIR`, `INCOMPLETE_DIR` or `DATA_DIR` — those are host
paths. Deleting `DATA_DIR` loses users, settings and integrations; deleting the config volumes
loses aMule's servers and shares, Transmission's torrent list, slskd's account and pyLoad's
queue.

So a backup is `DATA_DIR` + `DOWNLOAD_DIR` + the named volumes, e.g. per volume:

```bash
docker run --rm \
  -v transmule_transmission-config:/data:ro \
  -v "$PWD/backup":/backup \
  alpine tar czf /backup/transmission-config.tgz -C /data .
```

The volume prefix is the Compose project name — the install folder's name unless you set
`COMPOSE_PROJECT_NAME` — so check `docker volume ls` first.

## 11. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `port is already allocated` | Another service holds `3001`, `4662`, `4672`, `51413` or `50300`. Change the matching variable in `.env` and `docker compose up -d`. |
| Containers up, downloads never appear | `PUID`/`PGID` don't match the folder owner, or the path is a network mount without POSIX permissions. Check with `ls -ln` and `docker compose logs amule`. |
| `Can't connect to aMule` | EC password mismatch (`AMULE_GUI_PASSWORD` in `.env` vs `amule.conf`) or the aMule container is down. Internal port is `4712`. |
| `Can't connect to Transmission` | RPC must be enabled with the whitelist off — `docker compose exec transmission grep rpc /config/settings.json`. To check that it answers, run in the install folder: `docker compose exec transmission curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9091/transmission/rpc` — `409` is the expected reply (`9091` is internal-only). |
| Services page is empty / can't start containers | The app needs `/var/run/docker.sock`; if you removed that mount, service control is unavailable by design. |
| eD2K stuck at LowID | Ports `4662/tcp` and `4672/udp` not forwarded (or a second NAT in front). Nothing in the stack can fix that. |
| Everything downloads slowly | Normal while Kad is still connecting; check **Settings → Ports** and the aMule server list. |

## 12. Why the script exists at all

Because most people don't want to do steps 3–6 by hand, and because the same script has to work
on Unraid (paths, `PUID=99`), on Synology and on a random VPS. If you install manually, keep
`install.sh` around anyway: it is the reference for the one-time service configuration, and
re-running it over an existing install is a supported upgrade path.
