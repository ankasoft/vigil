#!/usr/bin/env bash
# Vigil agent installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
#     | sudo bash -s -- --key YOUR_KEY --hub https://vigil.example.com
#
# Or, after cloning:
#   sudo ./install.sh --key YOUR_KEY --hub https://vigil.example.com
#
# Options:
#   --key       <KEY>            shared API key (required)
#   --hub       <URL>            Worker base URL (required)
#   --interval  <SECONDS>        report interval, default 15
#   --sample    <SECONDS>        internal sample interval, default 3
#   --uninstall                  stop & remove

set -euo pipefail

KEY=""
HUB=""
INTERVAL="15"
SAMPLE="3"
UNINSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key)        KEY="$2"; shift 2 ;;
    --hub)        HUB="$2"; shift 2 ;;
    --interval)   INTERVAL="$2"; shift 2 ;;
    --sample)     SAMPLE="$2"; shift 2 ;;
    --uninstall)  UNINSTALL=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "vigil: must run as root (sudo)" >&2
  exit 1
fi

if [[ $UNINSTALL -eq 1 ]]; then
  systemctl disable --now vigil-agent.service 2>/dev/null || true
  rm -f /etc/systemd/system/vigil-agent.service
  rm -rf /opt/vigil-agent
  rm -f /etc/vigil-agent.env
  systemctl daemon-reload
  echo "vigil: uninstalled"
  exit 0
fi

if [[ -z "$KEY" || -z "$HUB" ]]; then
  echo "Usage: $0 --key KEY --hub URL [--interval 15] [--sample 3]" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "vigil: python3 is required" >&2
  exit 1
fi

# When piped via `curl | bash`, BASH_SOURCE[0] is unset; default to empty so
# `set -u` doesn't abort, then fall back to the current dir (agent.py won't be
# there, which triggers the download below).
SRC="${BASH_SOURCE[0]:-}"
if [[ -n "$SRC" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$SRC")" && pwd)"
else
  SCRIPT_DIR="$(pwd)"
fi

# When piped from curl there's no local agent.py — fetch it.
SRC_AGENT="$SCRIPT_DIR/agent.py"
SRC_UNIT="$SCRIPT_DIR/vigil-agent.service"
if [[ ! -f "$SRC_AGENT" ]]; then
  TMP="$(mktemp -d)"
  echo "vigil: downloading agent.py and vigil-agent.service"
  curl -fsSL -o "$TMP/agent.py" \
    https://raw.githubusercontent.com/ankasoft/vigil/main/agent/agent.py
  curl -fsSL -o "$TMP/vigil-agent.service" \
    https://raw.githubusercontent.com/ankasoft/vigil/main/agent/vigil-agent.service
  SRC_AGENT="$TMP/agent.py"
  SRC_UNIT="$TMP/vigil-agent.service"
fi

install -d -m 0755 /opt/vigil-agent
install -m 0755 "$SRC_AGENT" /opt/vigil-agent/agent.py
install -m 0644 "$SRC_UNIT" /etc/systemd/system/vigil-agent.service

# Write env file with restrictive perms (it holds the API key).
umask 077
cat > /etc/vigil-agent.env <<EOF
VIGIL_KEY=${KEY}
HUB_URL=${HUB%/}
INTERVAL=${INTERVAL}
SAMPLE_INTERVAL=${SAMPLE}
EOF
chmod 0600 /etc/vigil-agent.env

systemctl daemon-reload
systemctl enable --now vigil-agent.service

echo "vigil: installed and running."
echo "       systemctl status vigil-agent"
echo "       journalctl -u vigil-agent -f"
