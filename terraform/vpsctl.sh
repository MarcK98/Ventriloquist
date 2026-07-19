#!/usr/bin/env bash
# Turn the Windows VPS on/off from anywhere — NO AWS credentials needed.
# Talks to the control endpoint (an AWS Lambda) with a shared bearer token.
#
#   ./vpsctl.sh on       # start it; opens RDP to YOUR current IP; prints the IP
#   ./vpsctl.sh off      # stop it (closes RDP)
#   ./vpsctl.sh status   # is it on? what's the IP?
#
# Setup (one line, once): copy .vps-control.env.example to .vps-control.env and
# paste the URL + token Marc gave you. (Or export SPAWN_VPS_CONTROL_URL and
# SPAWN_VPS_TOKEN in your shell.) The Windows password is NOT handled here —
# get it from Marc.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config from .vps-control.env if present (env vars still win).
if [ -f "$DIR/.vps-control.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$DIR/.vps-control.env"; set +a
fi

URL="${SPAWN_VPS_CONTROL_URL:-}"
TOKEN="${SPAWN_VPS_TOKEN:-}"
ACTION="${1:-status}"

if [ -z "$URL" ] || [ -z "$TOKEN" ]; then
  echo "Missing config. Set SPAWN_VPS_CONTROL_URL and SPAWN_VPS_TOKEN" >&2
  echo "(copy .vps-control.env.example to .vps-control.env and fill it in — ask Marc for the values)." >&2
  exit 1
fi

case "$ACTION" in
  on|start)   METHOD=POST; ACT=start ;;
  off|stop)   METHOD=POST; ACT=stop ;;
  status)     METHOD=GET;  ACT=status ;;
  *) echo "usage: $0 {on|off|status}" >&2; exit 2 ;;
esac

# Trailing slash off the base URL, then hit ?action=
BASE="${URL%/}"
RESP=$(curl -s -X "$METHOD" -H "Authorization: Bearer $TOKEN" "${BASE}/?action=${ACT}")

# Pretty-print if node/python is around; otherwise raw.
if command -v node >/dev/null 2>&1; then
  echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})"
else
  echo "$RESP"
fi
