#!/bin/sh
# ── Ensure aMule uses /downloads and /incomplete ──────────────────────────────
# ngosang/amule only applies INCOMING_DIR/TEMP_DIR when creating a fresh
# amule.conf. If the conf already exists (persisted volume), the dirs are not
# updated. This wrapper patches the conf before the real entrypoint runs.

CONF="/home/amule/.aMule/amule.conf"

if [ -f "$CONF" ]; then
  sed -i 's|^IncomingDir=.*|IncomingDir=/downloads|' "$CONF"
  sed -i 's|^TempDir=.*|TempDir=/incomplete|'        "$CONF"
fi

exec /home/amule/entrypoint.sh "$@"
