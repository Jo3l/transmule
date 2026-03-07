#!/bin/sh
# ── TransMule — Unraid first-time setup ───────────────────────────────────────
# Run this once on your Unraid server before starting the stack.
# It copies .env.example → .env and fills in random secrets automatically.
#
# Usage:
#   cd /boot/config/plugins/compose.manager/projects/transmule
#   chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

if [ ! -f "$ENV_EXAMPLE" ]; then
  echo "ERROR: .env.example not found in $SCRIPT_DIR"
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  echo ".env already exists — skipping copy."
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Copied .env.example → .env"
fi

# Generate random hex strings (32 bytes = 64 hex chars)
gen_secret() {
  if command -v openssl > /dev/null 2>&1; then
    openssl rand -hex 32
  else
    # Fallback: read from /dev/urandom and encode as hex
    cat /dev/urandom | head -c 32 | od -A n -t x1 | tr -d ' \n'
  fi
}

# Replace AMULE_GUI_PASSWORD placeholder if it still has the default value
if grep -q '^AMULE_GUI_PASSWORD=changeme' "$ENV_FILE"; then
  SECRET="$(gen_secret | cut -c1-24)"
  # Use | as sed delimiter to avoid issues with / in the secret
  sed -i "s|^AMULE_GUI_PASSWORD=changeme|AMULE_GUI_PASSWORD=$SECRET|" "$ENV_FILE"
  echo "Generated AMULE_GUI_PASSWORD"
fi

# Replace JWT_SECRET placeholder if it still has the default value
if grep -q '^JWT_SECRET=change-me' "$ENV_FILE"; then
  SECRET="$(gen_secret)"
  sed -i "s|^JWT_SECRET=change-me.*|JWT_SECRET=$SECRET|" "$ENV_FILE"
  echo "Generated JWT_SECRET"
fi

echo ""
echo "Setup complete. Review your .env then start via:"
echo "  Docker -> Compose Manager -> transmule -> Up"
echo "  (or: docker compose up -d  after Compose Manager plugin is installed)"
