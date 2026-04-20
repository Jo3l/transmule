#!/usr/bin/env bash
# ─── TransMule — Development launcher ─────────────────────────────────────────
# Starts the middleware (Nitro, port 3000) and frontend (Nuxt, port 3001)
# in parallel. Ctrl-C stops both.

set -euo pipefail

nvm install 22 && nvm use 22

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Require Node.js 22+ (node:sqlite is built-in since 22.5) ─────────────────
NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo -e "\033[0;31mError: Node.js 22+ is required (found $(node --version)).\033[0m"
  echo -e "Run: \033[1mnvm install 22 && nvm use 22\033[0m"
  exit 1
fi

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No color

# ── Install deps if needed ────────────────────────────────────────────────────
for dir in middleware frontend; do
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    echo -e "${YELLOW}Installing $dir dependencies…${NC}"
    (cd "$ROOT/$dir" && npm install)
  fi
done

# ── Install full 7-Zip 26.00 binary (replaces bundled p7zip 16.02 stub) ──────
# The bundled 7za from 7zip-bin is p7zip 16.02 standalone which does NOT
# support RAR extraction. Replace it with the official 7-Zip 26.00 binary.
SEVENZ_VERSION="2600"
SEVENZ_ARCH="$(uname -m)"
case "$SEVENZ_ARCH" in
  x86_64)  SEVENZ_PKG="7z${SEVENZ_VERSION}-linux-x64.tar.xz";  SEVENZ_BIN_DIR="linux/x64" ;;
  aarch64) SEVENZ_PKG="7z${SEVENZ_VERSION}-linux-arm64.tar.xz"; SEVENZ_BIN_DIR="linux/arm64" ;;
  armv7l)  SEVENZ_PKG="7z${SEVENZ_VERSION}-linux-arm.tar.xz";   SEVENZ_BIN_DIR="linux/arm" ;;
  *) echo -e "${YELLOW}Warning: unsupported arch ${SEVENZ_ARCH}, skipping 7-Zip upgrade.${NC}"; SEVENZ_BIN_DIR="" ;;
esac
SEVENZ_DEST="$ROOT/middleware/node_modules/7zip-bin/${SEVENZ_BIN_DIR}/7za"
if [[ -n "$SEVENZ_BIN_DIR" ]]; then
  # Upgrade if missing or still the old p7zip 16.xx stub
  SEVENZ_CURRENT_VER=$(chmod +x "$SEVENZ_DEST" 2>/dev/null; "$SEVENZ_DEST" i 2>&1 | grep -oP '7-Zip.*\[\d+\] \K[\d.]+' | head -1 || echo "0")
  if [[ "$SEVENZ_CURRENT_VER" != "26.00" ]]; then
    echo -e "${YELLOW}Upgrading 7-Zip: ${SEVENZ_CURRENT_VER} → 26.00…${NC}"
    SEVENZ_TMP="$(mktemp)"
    if wget -qO "$SEVENZ_TMP" "https://github.com/ip7z/7zip/releases/download/26.00/${SEVENZ_PKG}"; then
      tar -xJf "$SEVENZ_TMP" -C /tmp 7zz
      mv /tmp/7zz "$SEVENZ_DEST"
      chmod +x "$SEVENZ_DEST"
      echo -e "${GREEN}7-Zip 26.00 installed at ${SEVENZ_DEST}${NC}"
    else
      echo -e "${YELLOW}Warning: could not download 7-Zip 26.00. RAR extraction may not work.${NC}"
    fi
    rm -f "$SEVENZ_TMP"
  else
    echo -e "${GREEN}7-Zip 26.00 already installed.${NC}"
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
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# ── Start middleware ──────────────────────────────────────────────────────────
echo -e "${CYAN}▸ Starting middleware (Nitro) on :3000${NC}"
(cd "$ROOT/middleware" && NITRO_HOST=0.0.0.0 NODE_OPTIONS="--experimental-sqlite" npm run dev) &
MW_PID=$!

# ── Start frontend ───────────────────────────────────────────────────────────
echo -e "${CYAN}▸ Starting frontend  (Nuxt)  on :3001${NC}"
(cd "$ROOT/frontend" && NUXT_TELEMETRY_DISABLED=1 NITRO_HOST=0.0.0.0 npm run dev -- --host 0.0.0.0) &
FE_PID=$!

echo -e "${GREEN}Both services running. Press Ctrl-C to stop.${NC}"
wait
