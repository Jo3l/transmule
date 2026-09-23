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
# aMule 3.1 moved the default-conf heredoc from entrypoint.sh into
# amule-config.sh (which entrypoint.sh sources). Patch BOTH so the
# ports survive on fresh volumes: entrypoint.sh (2.3.x/3.0.x images)
# and amule-config.sh (3.1 images, where the heredoc now lives).
CONFIG_SCRIPT="/home/amule/amule-config.sh"

# Patch the upstream entrypoint so it writes our ports instead of defaults
sed -i 's|Port=4662|Port=16881|g'   "$ENTRY"
sed -i 's|UDPPort=4672|UDPPort=16882|g' "$ENTRY"

# 3.1: the fresh-config template lives in amule-config.sh
if [ -f "$CONFIG_SCRIPT" ]; then
  sed -i 's|Port=4662|Port=16881|g'   "$CONFIG_SCRIPT"
  sed -i 's|UDPPort=4672|UDPPort=16882|g' "$CONFIG_SCRIPT"
fi

# Also patch an already-existing conf (in case entrypoint skips those lines)
if [ -f "$CONF" ]; then
  sed -i 's|^IncomingDir=.*|IncomingDir=/downloads|' "$CONF"
  sed -i 's|^TempDir=.*|TempDir=/incomplete|'        "$CONF"
  # SharedDir es la clave LEGACY de 2.x/3.0: en aMule 3.1 las carpetas
  # compartidas se leen de shareddir-explicit.dat / shareddir-recursive.dat
  # (con shareddir.dat como unión) — la escribe la propia imagen desde
  # MOD_AUTO_SHARE_DIRECTORIES. La mantenemos para daemons antiguos y porque
  # 3.1 simplemente la ignora.
  if grep -q '^SharedDir=' "$CONF"; then
    sed -i 's|^SharedDir=.*|SharedDir=/downloads|' "$CONF"
  else
    sed -i '/^TempDir=.*/a SharedDir=/downloads' "$CONF"
  fi
  sed -i '/^\[eMule\]/,/^\[/{s|^Port=.*|Port=16881|}' "$CONF"
  sed -i '/^\[eMule\]/,/^\[/{s|^UDPPort=.*|UDPPort=16882|}' "$CONF"
fi

exec "$ENTRY" "$@"
