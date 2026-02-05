#!/bin/sh
set -e

ENV_FILE=".env"

# --- Generate .env ---
if [ ! -f "$ENV_FILE" ]; then
  echo "Generating .env file..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
JWT_SECRET=$JWT_SECRET

# SMTP (for email notifications)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_FROM=noreply@example.com

# Optional
# PORT=3000
# FRONTEND_URL=https://your-domain.com
EOF
  echo ".env created with generated JWT_SECRET."
else
  echo ".env already exists, skipping generation."
fi

# --- Build and start ---
echo ""
echo "Building and starting services..."
docker compose up -d --build

# --- Detect IP and print URL ---
PORT="${PORT:-3000}"
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="localhost"

echo ""
echo "============================================"
echo "  Services started!"
echo ""
echo "  URL: http://${IP}:${PORT}"
echo ""
echo "  Open the URL above to complete setup."
echo "============================================"
