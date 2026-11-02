# TransMule on Unraid — Docker Compose Manager guide

TransMule is a five-container stack, so it is installed on Unraid through the **Docker Compose
Manager** plugin rather than a CA template (a Community Applications template can only describe
one container). This page is the Unraid-specific path: stack creation, `.env` for Unraid paths,
the one-time folders, autostart and updates.

Everything is pinned to a **release tag**. Replace `v1.182` with the tag you want from
<https://github.com/Jo3l/transmule/tags>; `main` moves.

## 0. Requirements

- Unraid **6.10 or newer**, array **started** (nothing under `/mnt/user` exists before that).
- Docker service **enabled** (`Settings → Docker`).
- **Docker Compose Manager** installed: *Apps* → search "Docker Compose Manager" → Install.
  It adds the `docker compose` CLI and a **Compose** section at the bottom of the *Docker* tab.
  Verify from a terminal: `docker compose version`.
- Free host ports: `3001` (web UI), `4662/tcp` + `4672/udp` (eD2K + Kad), `51413/tcp+udp`
  (BitTorrent), `50300/tcp` (Soulseek). Check *Docker* for anything already using them.
- A cache pool is strongly recommended for `appdata` (TransMule keeps SQLite there).

**Two ways in, same destination.**

- **The installer** (`docs/manual-install.md` describes it) is plugin-aware: on Unraid it detects
  Docker Compose Manager and installs the two files into its projects folder instead of
  `/mnt/user/appdata/transmule`, then starts the stack — the plugin lists it immediately. `--ref`
  still pins the release.
- **By hand** (this page): create the folder, drop the same two files there, press *Compose Up*.
  You see every value and the files stay yours.

Both end up in a stack directory the plugin can manage; only the first one also runs the one-time
service configuration for you.

## 1. Create the stack

*Docker* → scroll to the **Compose** section. The plugin lists **every directory under its
projects folder that contains a `docker-compose.yml`**, so two ways to create the stack:

- **Add New Stack** → name it `transmule`, which creates the directory for you, or
- create the directory yourself and drop the files into it (nothing else to register):

```
/boot/config/plugins/compose.manager/projects/transmule/
```

Two files go in there: `docker-compose.yml` and `.env`. The directory lives on the USB flash
(that is why stacks survive and get backed up with the flash) — which is also why **every path
inside `.env` must be absolute**: a relative `./downloads` would resolve to `/boot`, i.e. write
downloads onto the flash drive.

## 2. Get the compose file

**Option A — paste it in the UI.** Download the file somewhere first, then paste its contents
into *Edit Stack → Compose File* and save:

```bash
REL=v1.182
curl -fsSL "https://raw.githubusercontent.com/Jo3l/transmule/$REL/docker-compose.yml"
```

**Option B — drop it straight into the stack folder** (Unraid terminal / SSH), then reload the
plugin page:

```bash
REL=v1.182
cd /boot/config/plugins/compose.manager/projects/transmule
curl -fsSLo docker-compose.yml \
  "https://raw.githubusercontent.com/Jo3l/transmule/$REL/docker-compose.yml"
```

The file is self-contained: it needs only the five official images and the paths from `.env`.
No host scripts are mounted.

## 3. Create the `.env`

Compose reads `.env` from the stack directory automatically, so no plugin setting is needed.
If your plugin version has an *Env file* option, point it at the same absolute path.

```bash
cd /boot/config/plugins/compose.manager/projects/transmule

cat > .env <<EOF
PUID=99
PGID=100
TZ=Europe/Madrid                                  # your zone

TRANSMULE_PORT=3001
AMULE_ED2K_TCP_PORT=4662
AMULE_ED2K_UDP_PORT=4672
TRANSMISSION_PEER_PORT=51413
SLSKD_P2P_PORT=50300

DOWNLOAD_DIR=/mnt/user/downloads
INCOMPLETE_DIR=/mnt/user/downloads/.incomplete
DATA_DIR=/mnt/user/appdata/transmule

JWT_SECRET=$(openssl rand -hex 32)                # or leave it empty: the app generates one
AMULE_GUI_PASSWORD=$(openssl rand -hex 12)

TRANSMISSION_USER=
TRANSMISSION_PASS=
PYLOAD_USER=pyload
PYLOAD_PASSWORD=pyload

TRANSMULE_APP_IMAGE=ghcr.io/jo3l/transmule:latest
AMULE_IMAGE=ngosang/amule:latest
TRANSMISSION_IMAGE=lscr.io/linuxserver/transmission:latest
SLSKD_IMAGE=slskd/slskd:latest
PYLOAD_IMAGE=lscr.io/linuxserver/pyload-ng:latest
EOF
```

The unquoted `EOF` lets `openssl` run while the file is written; `TZ` is the only value you have
to edit by hand (`date` shows the box's zone). If you would rather type the file in the plugin's
editor, generate the two secrets first with `openssl rand -hex 32` / `openssl rand -hex 12`.
`chmod` is pointless here: `/boot` is FAT, so file modes are cosmetic — the file is only reachable
by Unraid itself anyway.

What matters on Unraid:

| Variable | Value here | Why |
| --- | --- | --- |
| `PUID` / `PGID` | `99` / `100` | `nobody`/`users` — the owner of `/mnt/user` files. Anything else produces files the shares can't manage. |
| `DOWNLOAD_DIR` | `/mnt/user/downloads` | Array path, mounted at `/downloads`. Point it at a share, never at `/boot`. |
| `INCOMPLETE_DIR` | `/mnt/user/downloads/.incomplete` | Separate host path for in-progress downloads, mounted at `/incomplete`. Keep it on the array, not on the cache. |
| `DATA_DIR` | `/mnt/user/appdata/transmule` | SQLite DB, users, settings, `.jwt_secret`. Cache pool if you have one. |
| `JWT_SECRET` | random | Generated per host; leave it empty instead and the app writes `DATA_DIR/.jwt_secret` on first start. |
| `AMULE_GUI_PASSWORD` | random | aMule's EC password (internal port 4712). The sample value in `.env.example` is public — never keep it. |
| `*_IMAGE` | `:latest` | To freeze an image, pin it by digest: `ghcr.io/jo3l/transmule@sha256:…` (read it with `docker buildx imagetools inspect ghcr.io/jo3l/transmule:latest`). |

If a port is already taken on your box, change the matching variable here (host side only — the
container side is fixed at 3001/4662/4672/51413/50300).

## 4. Create the folders and fix ownership

The stack directory is on the flash; the data lives on the array. Create the data folders before
the first `Compose Up` — otherwise Docker creates them as `root:root` and the containers (which
run as `99:100`) can't write:

```bash
mkdir -p /mnt/user/appdata/transmule
mkdir -p "/mnt/user/downloads/.incomplete"
chown -R 99:100 /mnt/user/appdata/transmule "/mnt/user/downloads/.incomplete"
```

`/mnt/user/downloads` itself is normally already `99:100`; if yours isn't, `chown` it too.

## 5. Start it

Press **Compose Up** on the stack (or, from the terminal in the stack directory,
`docker compose up -d`). First run pulls the five images.

Wait until the API answers — same readiness signal the installer uses:

```bash
curl -fsS http://127.0.0.1:3001/api/users/status
# {"hasUsers":false}   <- no admin account yet
```

Then open `http://<tower-ip>:3001`, create the admin account, and let the setup wizard finish
(plugins, TMDB/TVDB keys, port check).

## 6. One-time service configuration (recommended)

Two things the images don't take from the environment. On Unraid you have a terminal, so this is
three commands — run them **in the stack directory** so `docker compose` reuses the project's own
volumes:

```bash
cd /boot/config/plugins/compose.manager/projects/transmule
```

### 6.1 Transmission folders

linuxserver/transmission starts with `download-dir=/downloads/complete` and
`incomplete-dir=/downloads/incomplete`; TransMule expects flat `/downloads` and `/incomplete`.
The daemon rewrites `settings.json` when it exits, so it must be stopped while you patch it:

```bash
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
```

Skip it and everything still works — torrents just land in a `complete/` subfolder of the share.

### 6.2 aMule legacy ports

A new stack needs nothing: the aMule image writes `Port=4662`, `UDPPort=4672` and the
`/downloads`, `/incomplete` dirs itself. Only if you are reusing an **old** `amule-config` volume
whose `amule.conf` still has `16881/16882`:

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

## 7. Autostart

Enable the autostart toggle for the stack in the Compose section: the plugin starts it once the
array is up, in the order shown. (The toggle only writes an `autostart` file inside the stack
directory — if you created the stack by hand, the switch is all that is missing.) Do not also add
per-container autostart elsewhere: the stack is one unit, and `restart: unless-stopped` already
covers crashes.

## 8. Optional: Unraid labels (icon and WebUI button)

Compose containers don't get a WebUI button unless they carry Unraid's labels. Either use the
plugin's *Web UI* tab (if your version has one) or add them to the `app` service:

```yaml
    labels:
      net.unraid.docker.webui: "http://[IP]:[PORT:3001]"
      net.unraid.docker.icon: "https://raw.githubusercontent.com/Jo3l/transmule/main/frontend/assets/logo/logo320.png"
```

They are cosmetic. If you edit the compose file, remember they disappear the next time you
replace it with a new release's copy.

## 9. Updating

**UI:** *Update Stack* on the stack — it pulls the images and recreates the containers. `.env`,
`DATA_DIR` and the config volumes are untouched.

**By hand** (pinned to a tag, so you can diff first):

```bash
REL=v1.182                      # the release you are moving to
cd /boot/config/plugins/compose.manager/projects/transmule
curl -fsSLo docker-compose.yml.new \
  "https://raw.githubusercontent.com/Jo3l/transmule/$REL/docker-compose.yml"
diff -u docker-compose.yml docker-compose.yml.new   # review
mv docker-compose.yml.new docker-compose.yml
docker compose pull && docker compose up -d
```

The one-time configuration from step 6 lives in the volumes, not in the compose file: no
migration to re-run.

## 10. Backups

- **Stack definition** — `/boot/config/plugins/compose.manager/projects/transmule/` (it is on the
  flash, so it travels with any flash backup).
- **Application data** — `/mnt/user/appdata/transmule` (users, settings, integrations, JWT).
- **Downloads** — `/mnt/user/downloads`, your own share policy.
- **Service state** — the named volumes `transmule_amule-config`, `transmule_transmission-config`,
  `transmule_slskd-config`, `transmule_pyload-config` (aMule servers/shares, torrent list,
  Soulseek account, pyLoad queue). Back them up per volume, e.g.
  `docker run --rm -v transmule_transmission-config:/data:ro -v /mnt/user/backup:/backup alpine tar czf /backup/transmission-config.tgz -C /data .`

## 11. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Downloads or config appear under `/boot` | A path in `.env` is relative (`./downloads`). Every mount must be `/mnt/user/...`. |
| `Compose Up` fails with `port is already allocated` | Another Unraid container holds `3001`, `4662`, `4672`, `51413` or `50300`. Free it or change the variable in `.env`. |
| Containers are missing from the Docker tab | They live under the **Compose** section by default. The plugin's UI patch (Settings) or the step-8 labels make them show up like template containers. |
| Files owned by `root` / downloader can't move files | `PUID`/`PGID` are not `99`/`100`, or the folders were created by Docker before you chowned them. Fix both, then recreate the affected containers. |
| Torrents land in `/downloads/complete` | Step 6.1 was skipped. |
| Services page is empty / won't start containers | The app needs `/var/run/docker.sock` (mounted read-only in the compose). If you removed it, that page is dead by design. |
| Stack doesn't come back after a reboot | Autostart is off (step 7), or the array/Docker service didn't start. |
| `Can't connect to aMule` | `AMULE_GUI_PASSWORD` changed after `amule.conf` was written: the EC password must match on both sides (internal port `4712`). |
| eD2K stays *LowID* | Ports `4662/tcp` and `4672/udp` not forwarded on the router. Nothing in the stack can fix that. |

## See also

- [`docs/manual-install.md`](manual-install.md) — the same stack without any orchestrator, every
  `.env` value explained, including the non-Unraid cases.
- [Docker Compose Manager support thread](https://forums.unraid.net/topic/114415-plugin-docker-compose-manager/)
  — plugin behaviour, autostart and UI patches.
- The README's [`### NAS: Unraid and Synology`](../README.md#nas-unraid-and-synology) for the
  installer's Unraid defaults.
