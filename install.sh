#!/bin/sh
# ─── TransMule — installer / initial setup ────────────────────────────────────
# Prepares the whole environment (compose, .env with real secrets, download
# folders) and starts the stack. No git needed on the machine.
#
# Pinned, reviewed install (recommended) — download the script from a release
# tag, read it, then run it with --ref so the compose file and the .env template
# come from that same tag instead of the moving main branch:
#
#   REL=v1.182
#   curl -fsSLo install.sh https://raw.githubusercontent.com/Jo3l/transmule/$REL/install.sh
#   less install.sh
#   sh install.sh --ref "$REL"
#
# One-liner form (same behaviour, no reading first):
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/Jo3l/transmule/v1.182/install.sh)" install --ref v1.182
#
# That form (sh -c) keeps the terminal free for the wizard: the script asks
# step by step for the install folder, the download folders, the web port and
# the timezone. `curl … | sh` works too (questions are then read from
# /dev/tty) and, with no terminal, it uses the defaults (-y).
#
# Before anything else it checks Docker (>= 20.10), Docker Compose (>= 2.0) and
# the daemon; then it generates the .env, picks free ports and leaves the stack
# ready. Nothing is written until you confirm the summary.
#
# Flags:
#   --dir DIR          Install folder                     (default depends on the
#                                                          platform: ./transmule,
#                                                          /mnt/user/appdata/transmule
#                                                          on Unraid, /volume1/docker/transmule
#                                                          on Synology)
#   --downloads DIR    Completed downloads                 (default <dir>/downloads)
#   --incomplete DIR   In-progress downloads               (default <dir>/incomplete)
#   --data DIR         Database + settings folder          (default <dir>/data; Unraid:
#                                                          /mnt/user/appdata/transmule)
#   --port N           Web UI port                         (default 3001, or the
#                                                          first free one above
#                                                          it when taken)
#   --ref REF          Branch or tag to install            (default main; pass the
#                                                          tag you downloaded
#                                                          this script from)
#   --src DIR          Install from a local checkout instead of GitHub
#   --platform NAME    Force platform: generic|unraid|synology
#   --puid N/--pgid N  Container UID/GID                   (default current user;
#                                                          99/100 on Unraid)
#   --no-start         Fetch and configure, skip pull/up
#   --dry-run          Show what it would do; writes and downloads nothing
#   -y, --yes          No questions (everything default)
#   --allow-root       Allow running as root
#   -h, --help         This help
#
# Re-running it over an existing install = upgrade: keeps the .env (secrets,
# paths, ports) and the data, refreshes the compose and applies pending service
# configuration migrations.
# ──────────────────────────────────────────────────────────────────────────────

set -eu

REPO="Jo3l/transmule"
REF="main"
SRC_DIR=""
PLATFORM=""

DIR=""
DOWNLOADS=""
INCOMPLETE=""
DATA_ARG=""
APP_PORT=""
PUID=""
PGID=""
ASSUME_YES=0
DRY_RUN=0
NO_START=0
ALLOW_ROOT=0

# ── Output ────────────────────────────────────────────────────────────────────
say()  { printf '%s\n' "$*"; }
wiz()  { printf '\n▸ [%s/%s] %s\n' "$1" "$2" "$3"; }
step() { printf '\n▸ %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: install.sh [options]

  --dir DIR          Install folder                      (default ./transmule)
  --downloads DIR    Completed downloads                 (default <dir>/downloads)
  --incomplete DIR   In-progress downloads               (default <dir>/incomplete)
  --data DIR         Database + settings                 (default <dir>/data; Unraid:
                                                        /mnt/user/appdata/transmule)
  --port N           Web UI port                         (default 3001, or the
                                                          first free one above
                                                          it when taken)
  --ref REF          Branch or tag to install            (default main; pass the
                                                          release tag of this script)
  --src DIR          Install from a local checkout instead of GitHub
  --platform NAME    Force platform: generic|unraid|synology
  --puid N/--pgid N  Container UID/GID                   (default current user)
  --no-start         Fetch and configure, skip pull/up
  --dry-run          Show what it would do; writes and downloads nothing
  -y, --yes          No questions (everything default)
  --allow-root       Allow running as root
  -h, --help         This help
USAGE
}

# ── Arguments ─────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)        DIR="$2"; shift 2 ;;
    --downloads)  DOWNLOADS="$2"; shift 2 ;;
    --incomplete) INCOMPLETE="$2"; shift 2 ;;
    --data)       DATA_ARG="$2"; shift 2 ;;
    --port)       APP_PORT="$2"; shift 2 ;;
    --ref)        REF="$2"; shift 2 ;;
    --src)        SRC_DIR="$2"; shift 2 ;;
    --platform)   PLATFORM="$2"; shift 2 ;;
    --puid)       PUID="$2"; shift 2 ;;
    --pgid)       PGID="$2"; shift 2 ;;
    --no-start)   NO_START=1; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    -y|--yes)     ASSUME_YES=1; shift ;;
    --allow-root) ALLOW_ROOT=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "Unknown option: $1 (try --help)" ;;
  esac
done

# Which values were passed explicitly (so an upgrade can respect them)
DOWNLOADS_ARG="$DOWNLOADS"
INCOMPLETE_ARG="$INCOMPLETE"
DATA_ARG="${DATA_ARG:-}"
PORT_ARG="$APP_PORT"

# ── Terminal for the prompts when the script arrives through a pipe ───────────
# `curl | sh` keeps stdin busy with the script itself: prompts must come from
# /dev/tty. With no terminal (cron, CI) it runs unattended.
TTY_MODE=""
if [ "$ASSUME_YES" -eq 0 ]; then
  if [ -t 0 ]; then
    TTY_MODE="stdin"
  elif exec 3</dev/tty 2>/dev/null; then
    TTY_MODE="tty"
  fi
  [ -n "$TTY_MODE" ] || warn "No interactive terminal: using default values"
fi

read_reply() {
  REPLY=""
  if [ "$TTY_MODE" = "stdin" ]; then
    IFS= read -r REPLY || REPLY=""
  else
    IFS= read -r REPLY <&3 || REPLY=""
  fi
}

# ask <question> <default> → prints the answer
ask() {
  _prompt="$1"
  _default="$2"
  if [ -z "$TTY_MODE" ]; then
    printf '%s\n' "$_default"
    return 0
  fi
  printf '  %s [%s]: ' "$_prompt" "$_default" >&2
  read_reply
  [ -n "$REPLY" ] || REPLY="$_default"
  printf '%s\n' "$REPLY"
}

# ── Helpers ───────────────────────────────────────────────────────────────────
gen_secret() { # bytes
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -tx1 -N "$1" /dev/urandom | tr -d ' \n'
  fi
}

# First x.y[.z]-looking version found in a string
extract_version() {
  awk 'match($0, /[0-9]+\.[0-9]+(\.[0-9]+)?/) { print substr($0, RSTART, RLENGTH); exit }'
}

# version_ge <current> <minimum> → 0 if current >= minimum
version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    na = split(a, A, "."); nb = split(b, B, ".")
    for (i = 1; i <= 3; i++) {
      av = (i <= na && A[i] ~ /^[0-9]+$/) ? A[i] + 0 : 0
      bv = (i <= nb && B[i] ~ /^[0-9]+$/) ? B[i] + 0 : 0
      if (av > bv) exit 0
      if (av < bv) exit 1
    }
    exit 0
  }'
}

# set_env <KEY> <VALUE> <file>
set_env() {
  _key="$1"; _val="$2"; _file="$3"
  _esc=$(printf '%s' "$_val" | sed 's/[&|\\]/\\&/g')
  if grep -q "^${_key}=" "$_file"; then
    sed -i "s|^${_key}=.*|${_key}=${_esc}|" "$_file"
  else
    printf '\n%s=%s\n' "$_key" "$_val" >> "$_file"
  fi
}

get_env() { # <KEY> <file>
  sed -n "s|^$1=||p" "$2" | tail -n1
}


port_in_use() { # <port> <tcp|udp>
  _port="$1"; _proto="$2"
  if command -v ss >/dev/null 2>&1; then
    if [ "$_proto" = "udp" ]; then
      ss -lunH 2>/dev/null | awk '{print $4}' | grep -q "[:.]${_port}\$"
    else
      ss -ltnH 2>/dev/null | awk '{print $4}' | grep -q "[:.]${_port}\$"
    fi
  elif [ "$_proto" = "tcp" ] && command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$_port" 2>/dev/null
  else
    return 1 # cannot check it: assume free
  fi
}

# pick_port <default_port> <tcp|udp> → first free port from the default up
pick_port() {
  _candidate="$1"
  _limit=$((_candidate + 200))
  while [ "$_candidate" -le "$_limit" ]; do
    if ! port_in_use "$_candidate" "$2"; then
      printf '%s\n' "$_candidate"
      return 0
    fi
    _candidate=$((_candidate + 1))
  done
  printf '%s\n' "$1"
}

detect_tz() {
  if [ -f /etc/timezone ] && [ -s /etc/timezone ]; then
    head -n1 /etc/timezone
  elif command -v timedatectl >/dev/null 2>&1; then
    timedatectl show -p Timezone --value 2>/dev/null || echo UTC
  else
    echo UTC
  fi
}

# Target platform: unraid | synology | generic
detect_platform() {
  if [ -n "$PLATFORM" ]; then
    printf '%s\n' "$PLATFORM"
    return 0
  fi
  if [ -f /etc/unraid-version ] || { [ -d /mnt/user/appdata ] && [ ! -d /etc.defaults ]; }; then
    printf 'unraid\n'
  elif [ -f /etc/synology-release ] || [ -f /etc.defaults/VERSION ] || { [ -d /volume1 ] && [ -d /usr/syno ]; }; then
    printf 'synology\n'
  else
    printf 'generic\n'
  fi
}

fetch_file() { # <url> <destination>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$2" "$1"
  else
    wget -qO "$2" "$1"
  fi
}

lan_ips() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 addr show scope global 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2}'
  elif command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$'
  fi
}

abs_path() { # relative → absolute and normalised (creates nothing)
  case "$1" in
    /*) _p="$1" ;;
    ~*) _p="$HOME/${1#\~/}" ;;
    *)  _p="$(pwd)/$1" ;;
  esac
  if [ -d "$_p" ]; then
    ( cd "$_p" && pwd )
    return 0
  fi
  # Normalise ".", ".." and duplicated slashes without requiring the path to exist
  printf '%s\n' "$_p" | awk -F/ '{
    n = 0
    for (i = 1; i <= NF; i++) {
      if ($i == "" || $i == ".") continue
      if ($i == "..") { if (n > 0) n--; continue }
      stack[++n] = $i
    }
    out = ""
    for (i = 1; i <= n; i++) out = out "/" stack[i]
    print (out == "" ? "/" : out)
  }'
}

# ── Start ─────────────────────────────────────────────────────────────────────
say ""
say "  TransMule — installation wizard"
say "  ──────────────────────────────────────────────────────────────"
say "  I will ask where to install, where to keep the downloads, the"
say "  web port and the timezone. Then I generate the .env with random"
say "  secrets and leave everything ready to run."
say ""

# ── Target platform ───────────────────────────────────────────────────────────
PLATFORM_NAME=$(detect_platform)
case "$PLATFORM_NAME" in
  unraid)
    PLATFORM_LABEL="Unraid"
    DIR_DEFAULT="/mnt/user/appdata/transmule"
    PUID_DEFAULT=99
    PGID_DEFAULT=100
    # Downloads belong on the array, never next to the stack files (the flash)
    DOWNLOADS_DEFAULT="/mnt/user/downloads"
    INCOMPLETE_DEFAULT="/mnt/user/downloads/.incomplete"
    ;;
  synology)
    PLATFORM_LABEL="Synology DSM"
    DIR_DEFAULT="/volume1/docker/transmule"
    PUID_DEFAULT=1026
    PGID_DEFAULT=100
    ;;
  generic)
    PLATFORM_LABEL="generic Linux"
    DIR_DEFAULT="./transmule"
    PUID_DEFAULT=$(id -u)
    PGID_DEFAULT=$(id -g)
    ;;
  *)
    die "Unknown platform: $PLATFORM_NAME (use generic, unraid or synology)"
    ;;
esac

# ── Unraid: the Docker Compose Manager plugin ─────────────────────────────────
# The plugin lists every directory under its projects folder that holds a
# docker-compose.yml (php/compose_manager_main.php scans the folder) and drives
# each one with `docker compose -f … -p <stack>`. Installing there — instead of
# appdata — makes the stack show up in Docker → Compose with its Update Stack
# and autostart buttons, and keeps the same project and volume names.
# (defaults may already be set by the platform case above — keep them)
COMPOSE_PROJECTS_ROOT=""
: "${DOWNLOADS_DEFAULT:=}"
: "${INCOMPLETE_DEFAULT:=}"
: "${DATA_DEFAULT:=}"

if [ "$PLATFORM_NAME" = "unraid" ]; then
  _cm_root="${COMPOSE_MANAGER_PLUGIN_ROOT:-/usr/local/emhttp/plugins/compose.manager}"
  _cm_cfg="/boot/config/plugins/compose.manager/compose.manager.cfg"
  _cm_projects="/boot/config/plugins/compose.manager/projects"
  if [ -f "$_cm_cfg" ]; then
    _v=$(sed -n 's/^PROJECTS_FOLDER=//p' "$_cm_cfg" | tail -n1 | tr -d '"')
    [ -n "$_v" ] && _cm_projects="$_v"
  fi
  if [ -d "$_cm_root" ] || [ -f /boot/config/plugins/compose.manager/compose.manager.plg ]; then
    COMPOSE_PROJECTS_ROOT="$_cm_projects"
    DIR_DEFAULT="$COMPOSE_PROJECTS_ROOT/transmule"
    # The SQLite database belongs in appdata, not on the USB stick either
    DATA_DEFAULT="/mnt/user/appdata/transmule"
  fi
fi

# A normal user always wins: their own UID/GID, whatever the platform
if [ "$(id -u)" -ne 0 ]; then
  PUID_DEFAULT=$(id -u)
  PGID_DEFAULT=$(id -g)
fi

# Re-running inside an existing install = upgrade it in place
if [ -z "$DIR" ]; then
  if [ -f "./docker-compose.yml" ] && [ -f "./.env" ]; then
    DIR="."
  else
    DIR="$DIR_DEFAULT"
  fi
fi

# ── 1. Preflight ──────────────────────────────────────────────────────────────
wiz 1 6 "Checking Docker and Docker Compose"

command -v docker >/dev/null 2>&1 || die "Docker is not installed.

  Install it (Debian/Ubuntu):
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker \$USER && newgrp docker

  Other systems: https://docs.docker.com/engine/install/"

DOCKER_VERSION=$(docker --version 2>/dev/null | extract_version)
DOCKER_VERSION="${DOCKER_VERSION:-0}"
version_ge "$DOCKER_VERSION" "20.10" || die "Docker $DOCKER_VERSION is too old: 20.10 or newer is required.
  Upgrade: https://docs.docker.com/engine/install/"
ok "Docker $DOCKER_VERSION"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
  COMPOSE_VERSION=$(docker compose version 2>/dev/null | extract_version)
  COMPOSE_VERSION="${COMPOSE_VERSION:-0}"
  version_ge "$COMPOSE_VERSION" "2.0" || die "Docker Compose $COMPOSE_VERSION is too old: 2.0 or newer is required.
  Upgrade the plugin: https://docs.docker.com/compose/install/linux/"
  ok "Docker Compose $COMPOSE_VERSION"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
  COMPOSE_VERSION=$(docker-compose version 2>/dev/null | extract_version)
  warn "Only Docker Compose v1 found (${COMPOSE_VERSION:-unknown}), end-of-life since 2023."
  warn "If the stack fails to start, install the v2 plugin:"
  warn "  sudo apt install docker-compose-plugin   # Debian/Ubuntu"
else
  die "Docker Compose (v2) is missing.

  Install it as a plugin:
    sudo apt install docker-compose-plugin      # Debian/Ubuntu
  or follow: https://docs.docker.com/compose/install/linux/"
fi

if ! docker info >/dev/null 2>&1; then
  die "Cannot talk to the Docker daemon.
  Start Docker and make sure your user has permissions:
    sudo systemctl start docker
    sudo usermod -aG docker \$USER   # then log out and back in"
fi
ok "Docker daemon reachable"
ok "Platform: $PLATFORM_LABEL"

if [ "$(id -u)" -eq 0 ]; then
  if [ "$PLATFORM_NAME" = "generic" ] && [ "$ALLOW_ROOT" -eq 0 ]; then
    die "Do not run this as root: the files would end up owned by root.
  Run it as your normal user, or use --allow-root --puid N --pgid N."
  fi
  warn "Installing as root on $PLATFORM_LABEL: containers will write as PUID/PGID $PUID_DEFAULT/$PGID_DEFAULT"
  warn "If that is not what you want, re-run with --puid N --pgid N"
fi

command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || \
  die "curl or wget is required to download the stack"
command -v tar >/dev/null 2>&1 || die "tar is required"
command -v openssl >/dev/null 2>&1 || warn "No openssl: secrets will come from /dev/urandom (just as valid)"

# ── 2. Install values ─────────────────────────────────────────────────────────
wiz 2 6 "Configuration"

DIR=$(ask "Install folder" "$DIR")
DIR=$(abs_path "$DIR")
ENV_FILE="$DIR/.env"

# Existing install? → upgrade mode (keeps .env and data)
UPGRADE=0
if [ -f "$DIR/docker-compose.yml" ] && [ -f "$ENV_FILE" ]; then
  UPGRADE=1
fi

# On an upgrade the current .env wins: pressing Enter (or using -y) changes
# neither paths nor ports.
if [ "$UPGRADE" -eq 1 ]; then
  if [ -z "$DOWNLOADS" ]; then
    _v=$(get_env DOWNLOAD_DIR "$ENV_FILE")
    DOWNLOADS="${_v:-$DIR/downloads}"
  fi
  if [ -z "$INCOMPLETE" ]; then
    _v=$(get_env INCOMPLETE_DIR "$ENV_FILE")
    INCOMPLETE="${_v:-$DIR/incomplete}"
  fi
  if [ -z "$APP_PORT" ]; then
    _v=$(get_env TRANSMULE_PORT "$ENV_FILE")
    APP_PORT="${_v:-3001}"
  fi
  DATA=$(get_env DATA_DIR "$ENV_FILE")
  DATA="${DATA:-$DIR/data}"
  [ -n "$DATA_ARG" ] && DATA="$DATA_ARG"
  TZ_DEFAULT=$(get_env TZ "$ENV_FILE")
  TZ_DEFAULT="${TZ_DEFAULT:-$(detect_tz)}"
else
  if [ -z "$DOWNLOADS" ]; then DOWNLOADS="${DOWNLOADS_DEFAULT:-$DIR/downloads}"; fi
  if [ -z "$INCOMPLETE" ]; then INCOMPLETE="${INCOMPLETE_DEFAULT:-$DIR/incomplete}"; fi
  if [ -z "$APP_PORT" ]; then APP_PORT=3001; fi
  DATA="${DATA_ARG:-${DATA_DEFAULT:-$DIR/data}}"
  TZ_DEFAULT=$(detect_tz)
fi

DOWNLOADS=$(ask "Completed downloads folder" "$DOWNLOADS")
INCOMPLETE=$(ask "In-progress downloads folder" "$INCOMPLETE")
DOWNLOADS=$(abs_path "$DOWNLOADS")
INCOMPLETE=$(abs_path "$INCOMPLETE")
DATA=$(abs_path "$DATA")

APP_PORT=$(ask "Web UI port" "$APP_PORT")
case "$APP_PORT" in
  ''|*[!0-9]*) die "The port must be numeric: $APP_PORT" ;;
esac

TZ_VALUE=$(ask "Timezone" "$TZ_DEFAULT")

[ -n "$PUID" ] || PUID=$PUID_DEFAULT
[ -n "$PGID" ] || PGID=$PGID_DEFAULT

say ""
say "  Install folder         : $DIR"
say "  Completed downloads    : $DOWNLOADS"
say "  In-progress downloads  : $INCOMPLETE"
say "  Data (DB + settings)   : $DATA"
say "  Web port               : $APP_PORT"
say "  Timezone               : $TZ_VALUE"
say "  UID/GID                : $PUID/$PGID"
say "  Release                : $REF"
if [ -n "$COMPOSE_PROJECTS_ROOT" ]; then
  say "  Compose Manager        : yes — the stack appears in Docker → Compose"
fi
if [ "$UPGRADE" -eq 1 ]; then
  say "  Mode                   : UPGRADE (keeps .env and data)"
else
  say "  Mode                   : fresh install"
fi
if [ "$REF" = "main" ]; then
  say ""
  say "  ! main is a moving branch. To install exactly what you reviewed,"
  say "    re-run with the release tag:  --ref v1.182"
fi

case "$DIR" in
  /boot/*)
    warn "Stack files live on the USB flash (vfat): only compose + .env go there;"
    warn "downloads and the database stay on the array (see the paths above)."
    ;;
esac

# ── 3. Host ports ─────────────────────────────────────────────────────────────
if [ "$UPGRADE" -eq 1 ]; then
  # The current ports are held by the stack itself: keep them as they are.
  wiz 3 6 "Ports of the existing install"
  ED2K_TCP=$(get_env AMULE_ED2K_TCP_PORT "$ENV_FILE"); ED2K_TCP="${ED2K_TCP:-4662}"
  ED2K_UDP=$(get_env AMULE_ED2K_UDP_PORT "$ENV_FILE"); ED2K_UDP="${ED2K_UDP:-4672}"
  BT_PEER=$(get_env TRANSMISSION_PEER_PORT "$ENV_FILE"); BT_PEER="${BT_PEER:-51413}"
  SLSKD_P2P=$(get_env SLSKD_P2P_PORT "$ENV_FILE");     SLSKD_P2P="${SLSKD_P2P:-50300}"
else
  wiz 3 6 "Looking for free host ports"
  APP_PORT=$(pick_port "$APP_PORT" tcp)
  ED2K_TCP=$(pick_port 4662 tcp)
  ED2K_UDP=$(pick_port 4672 udp)
  BT_PEER=$(pick_port 51413 tcp)
  SLSKD_P2P=$(pick_port 50300 tcp)
fi

ok "Web UI           : $APP_PORT/tcp"
ok "eD2K TCP         : $ED2K_TCP/tcp"
ok "eD2K+Kad UDP     : $ED2K_UDP/udp"
ok "BitTorrent       : $BT_PEER/tcp+udp"
ok "Soulseek         : $SLSKD_P2P/tcp"

if [ "$DRY_RUN" -eq 1 ]; then
  step "Dry-run: nothing is written or downloaded"
  say "  Would download: https://codeload.github.com/$REPO/tar.gz/$REF"
  say "  Would generate $DIR/.env with:"
  say "    PUID=$PUID  PGID=$PGID  TZ=$TZ_VALUE"
  say "    DOWNLOAD_DIR=$DOWNLOADS"
  say "    INCOMPLETE_DIR=$INCOMPLETE"
  say "    DATA_DIR=$DATA"
  say "    TRANSMULE_PORT=$APP_PORT"
  say "    AMULE_ED2K_TCP_PORT=$ED2K_TCP  AMULE_ED2K_UDP_PORT=$ED2K_UDP"
  say "    TRANSMISSION_PEER_PORT=$BT_PEER  SLSKD_P2P_PORT=$SLSKD_P2P"
  say "    JWT_SECRET=<random>  AMULE_GUI_PASSWORD=<random>"
  say "  Would create: $DOWNLOADS $INCOMPLETE $DATA"
  say "  Would run: $COMPOSE pull && $COMPOSE up -d"
  say ""
  exit 0
fi

# Start it at the end? (the .env is generated either way, started or not)
if [ "$NO_START" -eq 0 ] && [ -n "$TTY_MODE" ] && [ "$ASSUME_YES" -eq 0 ]; then
  printf '\n  Start TransMule when done? [Y/n]: ' >&2
  read_reply
  case "$REPLY" in
    [nN]*) NO_START=1 ;;
  esac
fi

# ── 4. Fetch the stack ────────────────────────────────────────────────────────
wiz 4 6 "Downloading and configuring"

mkdir -p "$DIR" || die "Cannot create $DIR.
  Check the path and your permissions, or pass a different --dir."

say "  Creating folders"

# Docker would create these paths as root; the services run as PUID/PGID and
# then cannot write. Create them first, owned by the installing user, and do it
# before writing the .env so a bad path fails fast instead of leaving a .env
# that points nowhere.
for _d in "$DOWNLOADS" "$INCOMPLETE" "$DATA"; do
  mkdir -p "$_d" 2>/dev/null || die "Cannot create $_d.
  Check the path, that your user can write there, or pass --downloads/--incomplete."
  ok "$_d"
done

if [ -n "$SRC_DIR" ]; then
  [ -f "$SRC_DIR/docker-compose.yml" ] || die "--src $SRC_DIR does not contain docker-compose.yml"
  cp "$SRC_DIR/docker-compose.yml" "$DIR/docker-compose.yml"
  cp "$SRC_DIR/.env.example" "$DIR/.env.example"
  ok "Copied from $SRC_DIR"
else
  TMP_TARBALL=$(mktemp "${TMPDIR:-/tmp}/transmule-XXXXXX.tar.gz")
  trap 'rm -f "$TMP_TARBALL"' EXIT INT TERM
  say "  Downloading $REPO ($REF)…"
  fetch_file "https://codeload.github.com/$REPO/tar.gz/$REF" "$TMP_TARBALL" || {
    rmdir "$DIR" 2>/dev/null || true
    die "Could not download the stack. Check your connection or use --src DIR"
  }
  # Only the compose file and the .env template travel: everything else lives in
  # the image, and the per-service start-up scripts no longer exist (service
  # configuration happens here or in the compose file itself).
  TOP_DIR=$(tar -tzf "$TMP_TARBALL" 2>/dev/null | head -n1 | cut -d/ -f1)
  [ -n "$TOP_DIR" ] || die "The downloaded file does not look like a repo tarball"
  tar -xzf "$TMP_TARBALL" -C "$DIR" --strip-components=1 \
    "$TOP_DIR/docker-compose.yml" "$TOP_DIR/.env.example" || \
    die "Could not extract the stack (nonexistent ref: $REF?)"
  rm -f "$TMP_TARBALL"
  trap - EXIT INT TERM
  ok "Stack downloaded"
fi

[ -f "$DIR/docker-compose.yml" ] || die "docker-compose.yml not found in $DIR"

# ── 4b. .env ──────────────────────────────────────────────────────────────────
say ""
say "  Generating .env"

[ -f "$DIR/.env.example" ] || die ".env.example is missing in $DIR"

if [ "$UPGRADE" -eq 1 ]; then
  ok "Existing .env kept (secrets and paths untouched)"
  set_env TRANSMULE_PORT "$APP_PORT" "$ENV_FILE"
  if [ "$(get_env TZ "$ENV_FILE")" != "$TZ_VALUE" ]; then
    set_env TZ "$TZ_VALUE" "$ENV_FILE"
    ok "TZ → $TZ_VALUE"
  fi
  # Paths are only touched when the user asked for them explicitly
  if [ -n "$DOWNLOADS_ARG" ]; then
    set_env DOWNLOAD_DIR "$DOWNLOADS" "$ENV_FILE"
    ok "DOWNLOAD_DIR → $DOWNLOADS"
  fi
  if [ -n "$INCOMPLETE_ARG" ]; then
    set_env INCOMPLETE_DIR "$INCOMPLETE" "$ENV_FILE"
    ok "INCOMPLETE_DIR → $INCOMPLETE"
  fi
  if [ -n "$DATA_ARG" ]; then
    set_env DATA_DIR "$DATA" "$ENV_FILE"
    ok "DATA_DIR → $DATA"
  fi
  if grep -q '^AMULE_GUI_PASSWORD=change' "$ENV_FILE"; then
    set_env AMULE_GUI_PASSWORD "$(gen_secret 12)" "$ENV_FILE"
    ok "AMULE_GUI_PASSWORD was the sample one: regenerated"
  fi
  if grep -q '^JWT_SECRET=change-me' "$ENV_FILE" || grep -q '^JWT_SECRET=[[:space:]]*$' "$ENV_FILE"; then
    set_env JWT_SECRET "$(gen_secret 32)" "$ENV_FILE"
    ok "JWT_SECRET was empty or the sample one: generated"
  fi
else
  cp "$DIR/.env.example" "$ENV_FILE.tmp"

  set_env PUID "$PUID" "$ENV_FILE.tmp"
  set_env PGID "$PGID" "$ENV_FILE.tmp"
  set_env TZ "$TZ_VALUE" "$ENV_FILE.tmp"
  set_env DOWNLOAD_DIR "$DOWNLOADS" "$ENV_FILE.tmp"
  set_env INCOMPLETE_DIR "$INCOMPLETE" "$ENV_FILE.tmp"
  set_env DATA_DIR "$DATA" "$ENV_FILE.tmp"
  set_env TRANSMULE_PORT "$APP_PORT" "$ENV_FILE.tmp"
  set_env AMULE_ED2K_TCP_PORT "$ED2K_TCP" "$ENV_FILE.tmp"
  set_env AMULE_ED2K_UDP_PORT "$ED2K_UDP" "$ENV_FILE.tmp"
  set_env TRANSMISSION_PEER_PORT "$BT_PEER" "$ENV_FILE.tmp"
  set_env SLSKD_P2P_PORT "$SLSKD_P2P" "$ENV_FILE.tmp"
  set_env JWT_SECRET "$(gen_secret 32)" "$ENV_FILE.tmp"
  set_env AMULE_GUI_PASSWORD "$(gen_secret 12)" "$ENV_FILE.tmp"

  mv "$ENV_FILE.tmp" "$ENV_FILE"
  # The flash (vfat) has no file modes: never let that abort the install
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  ok "Secrets generated (JWT and aMule password)"
  ok "pyLoad credentials left alone: pyload/pyload (pyLoad's own defaults)"
fi

# ── 5. Start ──────────────────────────────────────────────────────────────────
if [ "$NO_START" -eq 1 ]; then
  say ""
  say "  ✓ All set. The .env is generated and the folders exist."
  say "    Start it whenever you like:"
  say "      cd $DIR && $COMPOSE up -d"
  say ""
  exit 0
fi

wiz 5 6 "Starting the services"

say "  Pulling images…"
( cd "$DIR" && $COMPOSE pull ) || die "Image download failed"

say "  Starting containers…"
( cd "$DIR" && $COMPOSE up -d ) || {
  warn "Start-up failed. Busy ports or a conflict with another stack:"
  ( cd "$DIR" && $COMPOSE ps ) || true
  exit 1
}

# ── 5b. Service configuration (one time only) ─────────────────────────────────
# This is what the scripts previously mounted from docker/amule and
# docker/transmission did: pin folders and internal ports the image does not
# expose as environment variables. It is applied here, persists in the volumes
# and never has to run again on start-up.
say "  Adjusting the service configuration…"

wait_for_file() { # <service> <path> [attempts]
  _svc="$1"; _path="$2"; _n=0; _max="${3:-30}"
  while [ "$_n" -lt "$_max" ]; do
    ( cd "$DIR" && $COMPOSE exec -T "$_svc" test -f "$_path" ) >/dev/null 2>&1 && return 0
    _n=$((_n + 1))
    sleep 2
  done
  return 1
}

AMULE_RESTART=0
TRANSMISSION_RESTART=0

# aMule: the image's internal ports (4662/tcp and 4672/udp, Kad shares the UDP)
if wait_for_file amule /home/amule/.aMule/amule.conf; then
  AMULE_CONF=/home/amule/.aMule/amule.conf
  _amule_ports=$( cd "$DIR" && $COMPOSE exec -T amule sh -c "grep -E '^Port=|^UDPPort=' $AMULE_CONF" 2>/dev/null || true )
  case "$_amule_ports" in
    *Port=4662*UDPPort=4672*)
      ok "aMule: internal ports already correct (4662/4672)"
      ;;
    *)
      if ( cd "$DIR" && $COMPOSE exec -T amule sh -c "
        sed -i -E '/^\[eMule\]/,/^\[/ s/^Port=.*/Port=4662/; /^\[eMule\]/,/^\[/ s/^UDPPort=.*/UDPPort=4672/' $AMULE_CONF &&
        sed -i -E 's|^IncomingDir=.*|IncomingDir=/downloads|; s|^TempDir=.*|TempDir=/incomplete|' $AMULE_CONF
      " ) >/dev/null 2>&1; then
        ok "aMule: migrated to the internal ports 4662/4672 (one time)"
        AMULE_RESTART=1
      else
        warn "Could not adjust amule.conf; check Settings → aMule"
      fi
      ;;
  esac
else
  warn "amule.conf not found (aMule still starting); leaving it as it is"
fi

# Transmission: folders, RPC without whitelist and the image's peer port
if wait_for_file transmission /config/settings.json; then
  _trans_result=$( cd "$DIR" && $COMPOSE exec -T transmission python3 - <<'PY' 2>/dev/null || true
import json
path = "/config/settings.json"
try:
    with open(path) as fh:
        cfg = json.load(fh)
except Exception:
    print("error")
    raise SystemExit(0)
want = {
    "download-dir": "/downloads",
    "incomplete-dir": "/incomplete",
    "incomplete-dir-enabled": True,
    "rpc-enabled": True,
    "rpc-bind-address": "0.0.0.0",
    "rpc-whitelist-enabled": False,
    "peer-port": 51413,
}
changed = False
for key, value in want.items():
    if cfg.get(key) != value:
        cfg[key] = value
        changed = True
if changed:
    with open(path, "w") as fh:
        json.dump(cfg, fh, indent=4, sort_keys=True)
print("changed" if changed else "ok")
PY
)
  case "$_trans_result" in
    *changed*)
      ok "Transmission: folders, RPC and peer port adjusted (one time)"
      TRANSMISSION_RESTART=1
      ;;
    *ok*)
      ok "Transmission: configuration already correct"
      ;;
    *)
      warn "Could not adjust Transmission's settings.json; check its configuration"
      ;;
  esac
else
  warn "Transmission's settings.json not found; leaving it as it is"
fi

if [ "$AMULE_RESTART" -eq 1 ] || [ "$TRANSMISSION_RESTART" -eq 1 ]; then
  RESTART_SERVICES=""
  if [ "$AMULE_RESTART" -eq 1 ]; then RESTART_SERVICES="amule"; fi
  if [ "$TRANSMISSION_RESTART" -eq 1 ]; then RESTART_SERVICES="$RESTART_SERVICES transmission"; fi
  say "  Restarting services to apply the changes…"
  ( cd "$DIR" && $COMPOSE restart $RESTART_SERVICES ) || warn "Could not restart: $RESTART_SERVICES"
fi

say "  Waiting for the web UI to answer…"
i=0
READY=0
while [ "$i" -lt 60 ]; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null "http://127.0.0.1:$APP_PORT/api/users/status" 2>/dev/null && READY=1
  else
    wget -qO /dev/null "http://127.0.0.1:$APP_PORT/api/users/status" 2>/dev/null && READY=1
  fi
  [ "$READY" -eq 1 ] && break
  i=$((i + 1))
  sleep 2
done

if [ "$READY" -ne 1 ]; then
  warn "The app did not answer within 120 s. Last log lines:"
  ( cd "$DIR" && $COMPOSE logs --tail 50 app ) || true
  exit 1
fi
ok "TransMule answering on port $APP_PORT"

# Admin account already there?
HAS_USERS=0
if command -v curl >/dev/null 2>&1; then
  STATUS_JSON=$(curl -fsS "http://127.0.0.1:$APP_PORT/api/users/status" 2>/dev/null || echo "")
else
  STATUS_JSON=$(wget -qO- "http://127.0.0.1:$APP_PORT/api/users/status" 2>/dev/null || echo "")
fi
case "$STATUS_JSON" in
  *'"hasUsers":true'*) HAS_USERS=1 ;;
esac

# ── 6. Summary and next steps ─────────────────────────────────────────────────
wiz 6 6 "Done"
say ""
say "  ✓ TransMule installed and running"
say "  ──────────────────────────────────────────────────────────────"
say ""
say "  Open the web UI:"
say "    http://localhost:$APP_PORT"
for _ip in $(lan_ips); do
  say "    http://$_ip:$APP_PORT"
done
say ""
say "  What is left (5 minutes, all from the web UI):"
if [ "$HAS_USERS" -eq 1 ]; then
  say "   1. Log in with your existing user."
else
  say "   1. Create the admin account (asked on first load)."
fi
say "   2. Check on the dashboard that aMule connects to a server and to Kad."
say "      slskd already ships with a generated Soulseek account; you can use"
say "      your own in slskd → Settings."
say "   3. Forward these ports on your router to this machine (otherwise eD2K"
say "      stays in LowID and P2P is slow):"
say "        TCP $ED2K_TCP   TCP+UDP $BT_PEER   TCP $SLSKD_P2P"
say "        UDP $ED2K_UDP   (eD2K and Kad share the same UDP port)"
say "      Settings → Ports checks whether they are open."
say "   4. Optional: TMDB/TVDB keys and the Plex token under"
say "      Settings → Integrations (planner and artwork)."
if [ -n "$COMPOSE_PROJECTS_ROOT" ]; then
  say "   5. Optional: turn on autostart for the stack in Docker → Compose;"
  say "      the plugin starts it with the array (restart: unless-stopped"
  say "      already covers crashes)."
fi
say ""
say "  For backups: $DATA and $DOWNLOADS"
say "  Management: cd $DIR && $COMPOSE ps | logs -f | restart | down"
say ""
