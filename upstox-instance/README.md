# ByajBazaar Upstox relay

Always-on service on your **upstox-instance** VM:

1. Connects to **Upstox Market Data Feed V3** (server-side token).
2. Exposes **WebSocket** for web/mobile with **ByajBazaar user JWT** (`?token=`).
3. Pushes `liveMarketRatesUpdated` JSON (gold/silver per gram).

ByajBazaar Lambda is **not** in the live tick path.

## Env

Copy `.env.example` → `.env` on the VM:

- `UPSTOX_ACCESS_TOKEN` — from Upstox (rotate if ever exposed).
- `TOKEN_SECRET`, `TOKEN_AUDIENCE`, `TOKEN_ISSUER`, `TOKEN_ALG` — **same as Backend** so app `accessToken` validates.

## One-command deploy (from your laptop)

```bash
export UPSTOX_VM_HOST=ubuntu@<PUBLIC_IP>
export UPSTOX_ACCESS_TOKEN=<from Upstox>
./deploy/deploy.sh
```

Uses JWT vars from `Backend/.env.production` and installs `upstox-relay` systemd unit.

## Run on the VM

```bash
cd upstox-instance
yarn install
yarn build
yarn start
```

Dev: `yarn dev`

Health: `GET http://HOST:8090/health`  
Snapshot: `GET http://HOST:8090/api/latest` (no auth; optional)

## WebSocket

```
wss://YOUR_RELAY_HOST/?token=<ByajBazaar_access_token>
```

Message shape (same as before):

```json
{ "type": "liveMarketRatesUpdated", "rates": { "configured": true, "gold": { ... }, "silver": { ... } } }
```

## TLS (recommended)

Put **Caddy** or **nginx** in front:

- `wss://market.byajbazaar.com` → `http://127.0.0.1:8090`
- Open firewall **only** 443 (and 22 for SSH).

## systemd

See `deploy/upstox-relay.service`. Adjust `WorkingDirectory` and `User`, then:

```bash
sudo cp deploy/upstox-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now upstox-relay
```

## Frontend / mobile

Set:

- Web: `NEXT_PUBLIC_UPSTOX_RELAY_WS_URL=wss://market.byajbazaar.com`
- Mobile: `EXPO_PUBLIC_UPSTOX_RELAY_WS_URL=wss://market.byajbazaar.com`

Initial quote can still use Backend `GET /api/v1/metal-rates/live-market` (REST, cached).
