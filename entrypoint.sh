#!/bin/sh
# ── TransMule entrypoint ───────────────────────────────────────────────────────
# Auto-generates NITRO_JWT_SECRET if not provided via environment.
# The value is persisted in /app/data/.jwt_secret so it survives container
# restarts even without an explicit env var.
# ─────────────────────────────────────────────────────────────────────────────

JWT_FILE="/app/data/.jwt_secret"

if [ -z "$NITRO_JWT_SECRET" ]; then
  if [ -f "$JWT_FILE" ]; then
    NITRO_JWT_SECRET="$(cat "$JWT_FILE")"
    echo "[transmule] Loaded JWT secret from $JWT_FILE"
  else
    NITRO_JWT_SECRET="$(openssl rand -hex 32)"
    echo "$NITRO_JWT_SECRET" > "$JWT_FILE"
    chmod 600 "$JWT_FILE"
    echo "[transmule] Generated new JWT secret → saved to $JWT_FILE"
  fi
  export NITRO_JWT_SECRET
fi

exec /usr/bin/supervisord -c /etc/supervisord.conf
