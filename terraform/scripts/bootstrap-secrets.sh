#!/usr/bin/env bash
# One-time (or rotate-anytime) setup: generates the local, gitignored secrets
# Terraform needs. Idempotent — safe to re-run; it only fills in what's missing.
#
#   ./scripts/bootstrap-secrets.sh
#
# Produces (all gitignored):
#   terraform.tfvars      — relay secrets + the VPS control token (random hex)
#   spawn-vps-key.pem/.pub — RSA keypair for the Windows admin password (get-password-data)
#   .vps-control.env       — the token for vpsctl.sh (URL filled in after `terraform apply`)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

touch terraform.tfvars
chmod 600 terraform.tfvars

# Ensure a `key = "<random hex>"` line exists in terraform.tfvars.
ensure_tfvar() {
  local key="$1"
  if ! grep -q "^${key}[[:space:]]*=" terraform.tfvars; then
    printf '%s = "%s"\n' "$key" "$(openssl rand -hex 32)" >> terraform.tfvars
    echo "  + $key"
  fi
}

echo "terraform.tfvars:"
ensure_tfvar relay_daemon_key
ensure_tfvar relay_dev_token
ensure_tfvar vps_control_token

# Mirror the control token into .vps-control.env for the vpsctl.sh client.
CONTROL_TOKEN=$(grep '^vps_control_token' terraform.tfvars | sed -E 's/.*"([^"]+)".*/\1/')
if [ ! -f .vps-control.env ]; then
  cat > .vps-control.env <<EOF
# Config for vpsctl.sh — turning the Windows VPS on/off with no AWS creds.
# SPAWN_VPS_CONTROL_URL is filled in from \`terraform output vps_control_url\`
# after the first apply; hand both of these to anyone you want to grant.
SPAWN_VPS_CONTROL_URL=
SPAWN_VPS_TOKEN=$CONTROL_TOKEN
EOF
  chmod 600 .vps-control.env
  echo "wrote .vps-control.env (token set; fill SPAWN_VPS_CONTROL_URL after apply)"
fi

# VPS RDP keypair (RSA/PEM — required by get-password-data --priv-launch-key).
if [ -f spawn-vps-key.pem ]; then
  echo "spawn-vps-key.pem already exists — leaving the VPS keypair alone."
else
  ssh-keygen -t rsa -b 2048 -m PEM -f spawn-vps-key -N "" -C "spawn-vps" >/dev/null
  chmod 600 spawn-vps-key
  mv spawn-vps-key spawn-vps-key.pem
  echo "wrote spawn-vps-key.pem + spawn-vps-key.pub"
fi

echo "Done. Now: terraform init && terraform apply"
