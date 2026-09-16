#!/usr/bin/env bash
# Deploy Upstox relay to the VM. Usage:
#   export UPSTOX_VM_HOST=ubuntu@<PUBLIC_IP>
#   export UPSTOX_ACCESS_TOKEN=<from Upstox dashboard>
#   ./deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="${BACKEND_ENV:-$ROOT/../.env.production}"
SSH_KEY="${SSH_KEY:-$ROOT/ssh-key-2026-09-16.key}"
REMOTE_DIR="${REMOTE_DIR:-/opt/byajbazaar/upstox-instance}"
UPSTOX_VM_HOST="${UPSTOX_VM_HOST:?Set UPSTOX_VM_HOST=ubuntu@<public-ip>}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

chmod 600 "$SSH_KEY"
KNOWN_HOSTS="${KNOWN_HOSTS:-/tmp/byajbazaar_upstox_known_hosts}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o UserKnownHostsFile="$KNOWN_HOSTS")

echo "==> Building locally"
cd "$ROOT"
yarn install --frozen-lockfile 2>/dev/null || yarn install
yarn build

echo "==> Syncing to $UPSTOX_VM_HOST:$REMOTE_DIR"
ssh "${SSH_OPTS[@]}" "$UPSTOX_VM_HOST" "sudo mkdir -p $REMOTE_DIR && sudo chown -R ubuntu:ubuntu $(dirname "$REMOTE_DIR")"
rsync -avz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules \
  --exclude .env \
  --exclude 'ssh-key-*' \
  --exclude .git \
  "$ROOT/" "$UPSTOX_VM_HOST:$REMOTE_DIR/"

echo "==> Writing .env on VM (JWT from Backend production env)"
if [[ -z "${UPSTOX_ACCESS_TOKEN:-}" ]]; then
  echo "UPSTOX_ACCESS_TOKEN is not set in your shell. Add it before deploy." >&2
  exit 1
fi

ENV_TMP="$(mktemp)"
trap 'rm -f "$ENV_TMP"' EXIT
{
  echo 'PORT=8090'
  echo 'HOST=0.0.0.0'
  printf 'UPSTOX_ACCESS_TOKEN=%s\n' "$UPSTOX_ACCESS_TOKEN"
  echo 'UPSTOX_GOLD_INSTRUMENT_KEY=MCX_FO|483079'
  echo 'UPSTOX_SILVER_INSTRUMENT_KEY=MCX_FO|495214'
  echo 'UPSTOX_GOLD_LTP_GRAMS=10'
  echo 'UPSTOX_SILVER_LTP_PER_KG=true'
  grep -E '^TOKEN_SECRET=' "$BACKEND_ENV" || true
  grep -E '^TOKEN_AUDIENCE=' "$BACKEND_ENV" || echo 'TOKEN_AUDIENCE=usersAudience'
  grep -E '^TOKEN_ISSUER=' "$BACKEND_ENV" || echo 'TOKEN_ISSUER=UsersIssuer'
  grep -E '^TOKEN_ALG=' "$BACKEND_ENV" || echo 'TOKEN_ALG=HS256'
} > "$ENV_TMP"

scp "${SSH_OPTS[@]}" "$ENV_TMP" "$UPSTOX_VM_HOST:$REMOTE_DIR/.env"
ssh "${SSH_OPTS[@]}" "$UPSTOX_VM_HOST" "chmod 600 $REMOTE_DIR/.env"

echo "==> Installing Node deps and enabling systemd"
ssh "${SSH_OPTS[@]}" "$UPSTOX_VM_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v yarn >/dev/null; then
  sudo npm install -g yarn
fi
yarn install --frozen-lockfile 2>/dev/null || yarn install
yarn build
sudo cp deploy/upstox-relay.service /etc/systemd/system/upstox-relay.service
sudo systemctl daemon-reload
sudo systemctl enable --now upstox-relay
sudo systemctl restart upstox-relay
sleep 2
curl -fsS http://127.0.0.1:8090/health && echo

if ! sudo iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport 8090 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 8090 -j ACCEPT
fi
if ! sudo iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
fi
if ! sudo iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT
fi
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save
fi
REMOTE

echo "==> Done. Health (on VM): http://127.0.0.1:8090/health"
