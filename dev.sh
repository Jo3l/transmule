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
# Resolve downloads dir to absolute path for the local middleware process
_dl_raw="${DOWNLOAD_DIR:-./downloads}"
if [[ "$_dl_raw" = /* ]]; then
  export NITRO_DOWNLOADS_DIR="$_dl_raw"
else
  export NITRO_DOWNLOADS_DIR="$ROOT/${_dl_raw#./}"
fi

COMPOSE="docker compose -f $ROOT/docker-compose.yml -f $ROOT/docker-compose.dev.yml"

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
