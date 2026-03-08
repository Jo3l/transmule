#!/usr/bin/env bash
# ── Ensure Transmission RPC is enabled on the correct port ───────────────────
# Mounted into linuxserver/transmission at /custom-cont-init.d/
# Runs once on every container start, BEFORE Transmission daemon launches.

SETTINGS="/config/settings.json"

if [ ! -f "$SETTINGS" ]; then
  echo "[transmule-init] settings.json not found yet — first boot, image will create it."
  exit 0
fi

echo "[transmule-init] Ensuring RPC is enabled on port 9091…"

# Use a python one-liner (available in the linuxserver base image) to patch JSON
python3 - "$SETTINGS" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)

changed = False

if not cfg.get("rpc-enabled", False):
    cfg["rpc-enabled"] = True
    changed = True

if cfg.get("rpc-port", 0) != 9091:
    cfg["rpc-port"] = 9091
    changed = True

# Bind to all interfaces so the middleware container can reach it
if cfg.get("rpc-bind-address", "") != "0.0.0.0":
    cfg["rpc-bind-address"] = "0.0.0.0"
    changed = True

# Allow requests from any host inside the Docker network
if cfg.get("rpc-whitelist-enabled", True):
    cfg["rpc-whitelist-enabled"] = False
    changed = True

# Lock download and incomplete directories to mounted container paths
if cfg.get("download-dir", "") != "/downloads":
    cfg["download-dir"] = "/downloads"
    changed = True

if not cfg.get("incomplete-dir-enabled", False):
    cfg["incomplete-dir-enabled"] = True
    changed = True

if cfg.get("incomplete-dir", "") != "/incomplete":
    cfg["incomplete-dir"] = "/incomplete"
    changed = True

if cfg.get("peer-port", 0) != 16884:
    cfg["peer-port"] = 16884
    changed = True

if changed:
    with open(path, "w") as f:
        json.dump(cfg, f, indent=4, sort_keys=True)
    print("[transmule-init] settings.json patched.")
else:
    print("[transmule-init] settings.json already correct.")
PYEOF
