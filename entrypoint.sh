#!/bin/sh
# ── TransMule entrypoint ───────────────────────────────────────────────────────
# Auto-generates NITRO_JWT_SECRET if not provided via environment.
# The value is persisted in /app/data/.jwt_secret so it survives container
# restarts even without an explicit env var.
# ─────────────────────────────────────────────────────────────────────────────

DATA_DIR="/app/data"
JWT_FILE="$DATA_DIR/.jwt_secret"

# Ensure the data directory exists and is writable
if [ ! -d "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR" || { echo "[transmule] ERROR: Cannot create $DATA_DIR — check volume permissions"; exit 1; }
fi

if [ ! -w "$DATA_DIR" ]; then
  echo "[transmule] WARNING: $DATA_DIR is not writable — trying to fix permissions"
  chmod 777 "$DATA_DIR" 2>/dev/null || echo "[transmule] ERROR: Cannot fix permissions on $DATA_DIR"
fi

if [ -z "$NITRO_JWT_SECRET" ]; then
  if [ -f "$JWT_FILE" ]; then
    NITRO_JWT_SECRET="$(cat "$JWT_FILE")"
    echo "[transmule] Loaded JWT secret from $JWT_FILE"
  else
    NITRO_JWT_SECRET="$(openssl rand -hex 32)"
    if echo "$NITRO_JWT_SECRET" > "$JWT_FILE" 2>/dev/null; then
      chmod 600 "$JWT_FILE"
      echo "[transmule] Generated new JWT secret → saved to $JWT_FILE"
    else
      echo "[transmule] WARNING: Could not save JWT secret to $JWT_FILE (read-only volume?) — using in-memory secret"
    fi
  fi
  export NITRO_JWT_SECRET
fi

exec /usr/bin/supervisord -c /etc/supervisord.conf
