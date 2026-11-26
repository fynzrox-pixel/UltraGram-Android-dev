#!/bin/bash
# UltraGram — Free Production Deployment Script
# Target: Ubuntu 24.04 LTS (Oracle Cloud Always Free or any compatible VPS)
# Budget: 0 UAH
#
# Usage:
#   1. Create a free VPS (Oracle Cloud Always Free, or alternative).
#   2. Point DuckDNS subdomain to the VPS public IP.
#   3. Copy this project to /opt/ultragram on the VPS.
#   4. Run: sudo bash deployment/setup-vps.sh
#
# This script installs Node.js, Nginx, Certbot, sets up the backend as a
# systemd service, configures the reverse proxy, obtains a Let's Encrypt
# certificate, and enables automatic certificate renewal.

set -e

# --- Configuration (edit these) ---
DOMAIN="ultragram-api.duckdns.org"
APP_DIR="/opt/ultragram"
BACKEND_PORT=8787
NODE_VERSION="20"

echo "=== UltraGram Free Production Setup ==="
echo "Domain: $DOMAIN"
echo "App dir: $APP_DIR"
echo ""

# --- 1. System update ---
echo "[1/8] Updating system..."
apt-get update -y
apt-get upgrade -y

# --- 2. Install Node.js ---
echo "[2/8] Installing Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi
node --version
npm --version

# --- 3. Install Nginx + Certbot ---
echo "[3/8] Installing Nginx and Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx

# --- 4. Install app dependencies ---
echo "[4/8] Installing app dependencies..."
cd "$APP_DIR"
npm install --production

# --- 5. Create .env file if missing ---
echo "[5/8] Checking .env..."
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/deployment/.env.example" "$APP_DIR/.env"
    echo "Created .env from template. EDIT IT NOW with real secrets!"
    echo "  nano $APP_DIR/.env"
    exit 1
fi

# --- 6. Configure systemd service ---
echo "[6/8] Configuring systemd service..."
cat > /etc/systemd/system/ultragram.service <<EOF
[Unit]
Description=UltraGram Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/backend/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Set ownership
chown -R www-data:www-data "$APP_DIR/database" 2>/dev/null || true
mkdir -p "$APP_DIR/database"
chown www-data:www-data "$APP_DIR/database"

systemctl daemon-reload
systemctl enable ultragram
systemctl start ultragram

echo "Backend started. Checking health..."
sleep 3
curl -s http://127.0.0.1:$BACKEND_PORT/api/health || echo "Backend not responding yet"

# --- 7. Configure Nginx ---
echo "[7/8] Configuring Nginx reverse proxy..."
sed "s/api.example.com/$DOMAIN/g" "$APP_DIR/deployment/nginx-ultragram.conf" > /etc/nginx/sites-available/ultragram
ln -sf /etc/nginx/sites-available/ultragram /etc/nginx/sites-enabled/ultragram
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# --- 8. Obtain Let's Encrypt certificate ---
echo "[8/8] Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@$DOMAIN || \
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email

# Enable auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer

# --- Firewall ---
echo "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- Backup cron ---
echo "Setting up daily database backup..."
cat > /etc/cron.daily/ultragram-backup <<'CRON'
#!/bin/bash
BACKUP_DIR="/opt/ultragram/backups"
mkdir -p "$BACKUP_DIR"
cp /opt/ultragram/database/ultragram.db "$BACKUP_DIR/ultragram-$(date +%Y%m%d).db"
# Keep only last 7 backups
ls -t "$BACKUP_DIR"/ultragram-*.db | tail -n +8 | xargs -r rm
CRON
chmod +x /etc/cron.daily/ultragram-backup

echo ""
echo "=== Setup complete! ==="
echo "API:  https://$DOMAIN/api/health"
echo "WS:   wss://$DOMAIN/ws"
echo ""
echo "Next steps:"
echo "  1. Edit $APP_DIR/.env with real secrets."
echo "  2. Restart: systemctl restart ultragram"
echo "  3. Verify: curl https://$DOMAIN/api/health"
echo "  4. Set GitHub variable ULTRAGRAM_BASE_URL=https://$DOMAIN/"
echo "  5. Trigger Android build in GitHub Actions."