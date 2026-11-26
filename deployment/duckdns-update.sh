#!/bin/bash
# DuckDNS IP update script.
# Usage: bash duckdns-update.sh <your-duckdns-token> <subdomain>
# Example: bash duckdns-update.sh abc123-def456 ultragram-api

TOKEN="$1"
SUBDOMAIN="$2"

if [ -z "$TOKEN" ] || [ -z "$SUBDOMAIN" ]; then
    echo "Usage: $0 <duckdns-token> <subdomain>"
    echo "Get your token from https://www.duckdns.org"
    exit 1
fi

echo "Updating DuckDNS: $SUBDOMAIN.duckdns.org"
curl -s "https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$TOKEN&ip=" 
echo ""

# Add to cron for automatic updates every 5 minutes
CRON_LINE="*/5 * * * * curl -s https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$TOKEN&ip= >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "duckdns.org/update"; echo "$CRON_LINE") | crontab -
echo "Cron job added for automatic IP updates."