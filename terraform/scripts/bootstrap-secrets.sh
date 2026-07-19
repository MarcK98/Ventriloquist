#!/usr/bin/env bash
# One-time (or rotate-anytime) setup: generates the relay's secrets and the
# Windows VPS RDP keypair as local, gitignored files. Run this once before
# the first `terraform apply`.
#
#   ./scripts/bootstrap-secrets.sh
#
# Produces (all gitignored):
#   terraform.tfvars      — relay_daemon_key / relay_dev_token (random hex)
#   spawn-vps-key.pem      — RSA private key (0600) for `get-password-data`
#   spawn-vps-key.pub      — matching OpenSSH public key, fed to aws_key_pair
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ -f terraform.tfvars ]; then
  echo "terraform.tfvars already exists — leaving it alone (delete it first if you want fresh relay secrets)."
else
  DAEMON_KEY=$(openssl rand -hex 32)
  DEV_TOKEN=$(openssl rand -hex 32)
  cat > terraform.tfvars <<EOF
relay_daemon_key = "$DAEMON_KEY"
relay_dev_token  = "$DEV_TOKEN"
EOF
  chmod 600 terraform.tfvars
  echo "wrote terraform.tfvars (fresh relay secrets, gitignored)"
fi

if [ -f spawn-vps-key.pem ]; then
  echo "spawn-vps-key.pem already exists — leaving the VPS keypair alone."
else
  # -m PEM: classic PEM/PKCS1 private key, which is what
  # `aws ec2 get-password-data --priv-launch-key` expects (not the modern
  # OpenSSH private-key format ssh-keygen defaults to for RSA today).
  ssh-keygen -t rsa -b 2048 -m PEM -f spawn-vps-key -N "" -C "spawn-vps" >/dev/null
  chmod 600 spawn-vps-key
  mv spawn-vps-key spawn-vps-key.pem
  echo "wrote spawn-vps-key.pem + spawn-vps-key.pub (gitignored)"
fi

echo "Done. Now: terraform init && terraform plan"
