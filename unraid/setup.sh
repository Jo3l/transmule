#!/bin/sh
# ── TransMule — Unraid first-time setup ───────────────────────────────────────
# One-liner install (run from your project directory):
#
#   mkdir -p /boot/config/plugins/compose.manager/projects/transmule
#   cd /boot/config/plugins/compose.manager/projects/transmule
#   wget -qO- https://raw.githubusercontent.com/Jo3l/transmule/main/unraid/setup.sh | sh
#
# Or download and run manually:
#   wget https://raw.githubusercontent.com/Jo3l/transmule/main/unraid/setup.sh
#   chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# When piped via wget | sh, $0 is "sh" — use pwd instead
SCRIPT_DIR="$(pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

GITHUB_RAW="https://raw.githubusercontent.com/Jo3l/transmule/main/unraid"

# ── Download latest files from GitHub ────────────────────────────────────────
download() {
  url="$1"
  dest="$2"
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget > /dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    echo "ERROR: neither curl nor wget found"
    exit 1
  fi
}

echo "Downloading latest docker-compose.yml..."
download "$GITHUB_RAW/docker-compose.yml" "$SCRIPT_DIR/docker-compose.yml"
echo "  → $SCRIPT_DIR/docker-compose.yml"

echo "Downloading latest .env.example..."
download "$GITHUB_RAW/.env.example" "$ENV_EXAMPLE"
echo "  → $ENV_EXAMPLE"

# ── Copy .env.example → .env (skip if already exists) ────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo ".env already exists — skipping copy (secrets preserved)."
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Copied .env.example → .env"
fi

# ── Generate random secrets ───────────────────────────────────────────────────
gen_secret() {
  if command -v openssl > /dev/null 2>&1; then
    openssl rand -hex 32
  else
    cat /dev/urandom | head -c 32 | od -A n -t x1 | tr -d ' \n'
  fi
}

if grep -q '^AMULE_GUI_PASSWORD=changeme' "$ENV_FILE"; then
  SECRET="$(gen_secret | cut -c1-24)"
  sed -i "s|^AMULE_GUI_PASSWORD=changeme|AMULE_GUI_PASSWORD=$SECRET|" "$ENV_FILE"
  echo "Generated AMULE_GUI_PASSWORD"
fi

if grep -q '^JWT_SECRET=change-me' "$ENV_FILE"; then
  SECRET="$(gen_secret)"
  sed -i "s|^JWT_SECRET=change-me.*|JWT_SECRET=$SECRET|" "$ENV_FILE"
  echo "Generated JWT_SECRET"
fi

# ── Create aMule entrypoint wrapper ──────────────────────────────────────────
# Patches IncomingDir/TempDir in amule.conf on every container start so the
# dirs stay correct even when the conf was previously created with old values.
APPDATA_DIR_VAL=$(grep '^APPDATA_DIR=' "$ENV_FILE" | cut -d= -f2-)
APPDATA_DIR_VAL="${APPDATA_DIR_VAL:-/mnt/user/appdata/transmule}"
AMULE_INIT_DIR="$APPDATA_DIR_VAL/amule-init"
mkdir -p "$AMULE_INIT_DIR"
cat > "$AMULE_INIT_DIR/wrap-entrypoint.sh" <<'WRAP'
#!/bin/sh
CONF="/home/amule/.aMule/amule.conf"
if [ -f "$CONF" ]; then
  sed -i 's|^IncomingDir=.*|IncomingDir=/downloads|' "$CONF"
  sed -i 's|^TempDir=.*|TempDir=/incomplete|'        "$CONF"
fi
exec /home/amule/entrypoint.sh "$@"
WRAP
chmod +x "$AMULE_INIT_DIR/wrap-entrypoint.sh"
echo "Created aMule wrapper at $AMULE_INIT_DIR/wrap-entrypoint.sh"

echo ""
echo "✓ Setup complete. Edit $ENV_FILE if needed, then start:"
echo "  Docker → Compose Manager → transmule → Up"
echo "  (or: docker compose up -d)"
