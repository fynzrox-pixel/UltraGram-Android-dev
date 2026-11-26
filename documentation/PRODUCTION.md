# Production Deployment

See deployment/PRODUCTION.md and deployment/.env.example.

## Steps
1. Provision Linux VPS, install Node.js LTS.
2. Copy project, npm install.
3. Set environment variables (PORT, ULTRAGRAM_JWT, ULTRAGRAM_DB, GOOGLE_CLIENT_ID).
4. Run behind reverse proxy (nginx/Caddy) with TLS.
5. Proxy WebSocket (/ws) with upgrade support.
6. Run with process manager (pm2/systemd).
7. Set up backups (database + uploads).
8. Configure monitoring/health checks.
