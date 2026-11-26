# Production Deployment Guide

## Requirements
- Linux VPS (Ubuntu 22.04+)
- Node.js LTS (>=20)
- Domain with DNS A record
- TLS certificate (Let's Encrypt via Caddy/nginx)

## Install
```
git clone <repo> /opt/ultragram
cd /opt/ultragram
npm install --production
```

## Environment
Copy deployment/.env.example to .env and fill secrets. Never commit .env.

## Run
```
node backend/server.js
```
Use pm2 or systemd for auto-restart. Health check: GET /api/health.

## Reverse proxy (nginx)
```
server {
  listen 443 ssl;
  server_name your-domain.com;
  location / { proxy_pass http://127.0.0.1:8787; }
  location /ws { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
}
```

## Backups
Run scripts/backup.js (create) via cron daily. Store off-server.
## HTTPS / WSS (Production)
Use `deployment/nginx-ultragram.conf` or `deployment/Caddyfile` as a reverse proxy in front of the backend.

- Backend stays on `127.0.0.1:8787` (never expose it directly).
- Public API: `https://api.<DOMAIN>/`
- WebSocket: `wss://api.<DOMAIN>/ws?token=...`
- HTTP is redirected to HTTPS by the proxy.
- TLS certificates come from Let's Encrypt (certbot for nginx, automatic for Caddy).
- Set `NODE_ENV=production` and fill `deployment/.env.example`.

### Android
- Release builds require HTTPS. Pass the real address at build time:
  `gradle assembleRelease -Pultragram.baseUrl=https://api.<DOMAIN>/`
  or set the GitHub variable `ULTRAGRAM_BASE_URL=https://api.<DOMAIN>/`.
- The user can also enter the address in the app (Settings -> server address).
- Debug builds keep `http://10.0.2.2:8787/` for the emulator and LAN addresses.

### Windows
- The Electron client currently runs an embedded local backend.
- For a production build that talks to the remote backend, configure the backend URL
  in the app settings / build and switch the client from the embedded server to
  `https://api.<DOMAIN>/`. This is the next step and requires a VPS + domain.

### Required to go live
1. A domain name (e.g. `api.example.com`) with DNS A record pointing to the VPS.
2. A Linux VPS with Node.js, Nginx or Caddy, and a firewall allowing 80/443.
3. Environment variables from `deployment/.env.example` (including `ULTRAGRAM_JWT`,
   `ULTRAGRAM_BOOTSTRAP_SECRET`, `ULTRAGRAM_ADMIN_PASSWORD`).
4. A database backup before any migration.
5. GitHub variable `ULTRAGRAM_BASE_URL` for CI builds.

### Verification (only after the above exists)
- `curl https://api.<DOMAIN>/api/health` returns `{"ok":true,...,"version":"1.0.0.F2"}`.
- TLS certificate valid and auto-renewing.
- `wss://api.<DOMAIN>/ws?token=...` connects.
- Android Release APK and Windows client log in and sync messages.

## Monitoring
Use /api/health and process monitoring.
