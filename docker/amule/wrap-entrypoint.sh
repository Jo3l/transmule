#!/bin/sh
# ── Ensure aMule uses /downloads and /incomplete ──────────────────────────────
# ngosang/amule only applies INCOMING_DIR/TEMP_DIR when creating a fresh
# amule.conf. If the conf already exists (persisted volume), the dirs are not
# updated. This wrapper patches the conf before the real entrypoint runs.
#
# The upstream entrypoint.sh also hardcodes Port=4662 / UDPPort=4672 when it
# writes/updates amule.conf, so we patch it directly before exec-ing it.

CONF="/home/amule/.aMule/amule.conf"
ENTRY="/home/amule/entrypoint.sh"

# Patch the upstream entrypoint so it writes our ports instead of defaults
sed -i 's|Port=4662|Port=16881|g'   "$ENTRY"
sed -i 's|UDPPort=4672|UDPPort=16882|g' "$ENTRY"

# Also patch an already-existing conf (in case entrypoint skips those lines)
if [ -f "$CONF" ]; then
  sed -i 's|^IncomingDir=.*|IncomingDir=/downloads|' "$CONF"
  sed -i 's|^TempDir=.*|TempDir=/incomplete|'        "$CONF"
  sed -i '/^\[eMule\]/,/^\[/{s|^Port=.*|Port=16881|}' "$CONF"
  sed -i '/^\[eMule\]/,/^\[/{s|^UDPPort=.*|UDPPort=16882|}' "$CONF"
fi

exec "$ENTRY" "$@"
