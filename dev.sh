#!/usr/bin/env bash
# ─── TransMule — Development launcher ─────────────────────────────────────────
# Starts the middleware (Nitro, port 3000) and frontend (Nuxt, port 3001)
# in parallel. Ctrl-C stops both.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/.dev.pid"

# ── Single-instance guard ────────────────────────────────────────────────────
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo -e "\033[1;33m⚠ Another dev session is already running (PID $OLD_PID). Refusing to start.\033[0m"
    echo -e "\033[1;33m  To force-start, run: rm -f $PIDFILE\033[0m"
    exit 1
  else
    # Stale PID file — clean it up
    rm -f "$PIDFILE"
  fi
fi
echo $$ > "$PIDFILE"

# ── Try nvm, but do not fail if unavailable ──────────────────────────────────
if command -v nvm &>/dev/null || [ -s "$HOME/.nvm/nvm.sh" ]; then
  [ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh" 2>/dev/null || true
  nvm install 22 2>/dev/null && nvm use 22 2>/dev/null || true
fi

# ── Colors ────────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── Require Node.js 22+ (node:sqlite is built-in since 22.5) ─────────────────
NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo -e "${RED}Error: Node.js 22+ is required (found $(node --version)).${NC}"
  exit 1
fi

# ── Free required ports ──────────────────────────────────────────────────────
MW_PORT=3000
FE_PORT=3001

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}▸ Port $port is in use by PID(s): $(echo $pids | tr '\n' ' ')${NC}"
    echo -e "${YELLOW}  Stopping old process(es)…${NC}"
    # Try graceful kill first, then force
    echo "$pids" | tr ' ' '\n' | xargs -r kill 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | tr ' ' '\n' | xargs -r kill -9 2>/dev/null || true
      sleep 0.5
    fi
    if lsof -ti :"$port" &>/dev/null; then
      echo -e "${RED}  Could not free port $port. Aborting.${NC}"
      exit 1
    fi
    echo -e "${GREEN}  Port $port freed.${NC}"
  fi
}

free_port $MW_PORT
free_port $FE_PORT

# ── Install deps if needed ────────────────────────────────────────────────────
for dir in middleware frontend; do
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    echo -e "${YELLOW}Installing $dir dependencies…${NC}"
    (cd "$ROOT/$dir" && npm install)
  fi
done

# ── Ensure unar + lsar are installed ──────────────────────────────────────────
if ! command -v unar &>/dev/null || ! command -v lsar &>/dev/null; then
  echo -e "${CYAN}▸ Installing unar / lsar…${NC}"
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y --no-install-recommends unar
  elif command -v brew &>/dev/null; then
    brew install unar
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm unarchiver
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y unar
  else
    echo -e "${YELLOW}Warning: cannot auto-install unar. Install it manually (apt/brew/pacman/dnf).${NC}"
  fi
fi

# ── Ensure zip is installed ───────────────────────────────────────────────────
if ! command -v zip &>/dev/null; then
  echo -e "${CYAN}▸ Installing zip…${NC}"
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y --no-install-recommends zip
  elif command -v brew &>/dev/null; then
    brew install zip
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm zip
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y zip
  else
    echo -e "${YELLOW}Warning: cannot auto-install zip. Install it manually.${NC}"
  fi
fi

# ── Ensure data directory exists ──────────────────────────────────────────────
mkdir -p "$ROOT/data"
export NITRO_DB_PATH="$ROOT/data/amule-middleware.db"

# ── Load .env first so credentials are available for the exports below ───────
if [ -f "$ROOT/.env" ]; then
  set -a; source "$ROOT/.env"; set +a
fi

# ── Point middleware at localhost (containers expose ports via dev override) ──
export NITRO_AMULE_HOST="127.0.0.1"
export NITRO_AMULE_PORT="4712"
export NITRO_AMULE_PASSWORD="${AMULE_GUI_PASSWORD:-hLETKciXJlnMAN0Z}"
export NITRO_TRANSMISSION_URL="http://127.0.0.1:9091/transmission/rpc"
export NITRO_PYLOAD_URL="http://127.0.0.1:8000"
export NITRO_PYLOAD_USERNAME="${PYLOAD_USER:-pyload}"
export NITRO_PYLOAD_PASSWORD="${PYLOAD_PASSWORD:-pyload}"
# Let local middleware and docker CLI share the same Docker socket in dev mode.
# Priority: explicit NITRO_DOCKER_SOCKET > DOCKER_HOST unix socket > standard sockets.
detect_docker_socket() {
  if [[ -n "${NITRO_DOCKER_SOCKET:-}" ]]; then
    echo "${NITRO_DOCKER_SOCKET}"
    return 0
  fi

  if [[ "${DOCKER_HOST:-}" == unix://* ]]; then
    echo "${DOCKER_HOST#unix://}"
    return 0
  fi

  if [[ -S "/var/run/docker.sock" ]]; then
    echo "/var/run/docker.sock"
    return 0
  fi

  local rootless_sock="/run/user/$(id -u)/docker.sock"
  if [[ -S "$rootless_sock" ]]; then
    echo "$rootless_sock"
    return 0
  fi

  return 1
}

if _docker_sock="$(detect_docker_socket)"; then
  export NITRO_DOCKER_SOCKET="$_docker_sock"
  if [[ -z "${DOCKER_HOST:-}" ]]; then
    export DOCKER_HOST="unix://$_docker_sock"
  fi
  echo -e "${CYAN}▸ Docker socket configured: ${NITRO_DOCKER_SOCKET}${NC}"
else
  echo -e "${YELLOW}Docker socket not found. Set NITRO_DOCKER_SOCKET or DOCKER_HOST (unix://...) to enable container management in dev.${NC}"
fi
# Resolve downloads dir to absolute path for the local middleware process
_dl_raw="${DOWNLOAD_DIR:-./downloads}"
if [[ "$_dl_raw" = /* ]]; then
  export NITRO_DOWNLOADS_DIR="$_dl_raw"
else
  export NITRO_DOWNLOADS_DIR="$ROOT/${_dl_raw#./}"
fi

COMPOSE="docker compose -f $ROOT/docker-compose.yml -f $ROOT/docker-compose.dev.yml"

# Fail fast if docker CLI cannot reach the daemon.
if ! docker info >/dev/null 2>&1; then
  echo -e "${YELLOW}Cannot connect to Docker daemon. Check Docker service and socket permissions.${NC}"
  echo -e "${YELLOW}Current DOCKER_HOST=${DOCKER_HOST:-<unset>} NITRO_DOCKER_SOCKET=${NITRO_DOCKER_SOCKET:-<unset>}${NC}"
  exit 1
fi

# ── Start Docker containers (aMule + Transmission) ───────────────────────────
echo -e "${CYAN}▸ Starting aMule, Transmission & pyLoad containers (dev ports exposed)…${NC}"
$COMPOSE up -d amule transmission pyload

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}Shutting down…${NC}"
  kill $MW_PID $FE_PID 2>/dev/null || true
  wait $MW_PID $FE_PID 2>/dev/null || true
  echo -e "${YELLOW}Stopping Docker containers…${NC}"
  $COMPOSE stop amule transmission pyload
  rm -f "$PIDFILE"
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# ── Start middleware ──────────────────────────────────────────────────────────
echo -e "${CYAN}▸ Starting middleware (Nitro) on :${MW_PORT}${NC}"
(cd "$ROOT/middleware" && NITRO_PORT=$MW_PORT NITRO_HOST=0.0.0.0 NODE_OPTIONS="--experimental-sqlite --openssl-legacy-provider" npm run dev) &
MW_PID=$!

# ── Start frontend ───────────────────────────────────────────────────────────
echo -e "${CYAN}▸ Starting frontend  (Nuxt)  on :${FE_PORT}${NC}"
(cd "$ROOT/frontend" && NUXT_TELEMETRY_DISABLED=1 PORT=$FE_PORT NUXT_PORT=$FE_PORT npm run dev -- --host 0.0.0.0 --port "$FE_PORT") &
FE_PID=$!

echo -e "${GREEN}Both services running. Press Ctrl-C to stop.${NC}"
wait
