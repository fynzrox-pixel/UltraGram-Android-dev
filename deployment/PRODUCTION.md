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
## Monitoring
Use /api/health and process monitoring.
