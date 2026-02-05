#!/bin/sh
set -e

ENV_FILE=".env"

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

echo "Starting services..."
docker compose up -d --build

echo ""
echo "Waiting for backend to be ready..."
sleep 5

echo "Seeding database..."
docker compose exec backend node dist/db/seed.js 2>/dev/null || echo "Seed skipped (already seeded or not ready yet)."

echo ""
echo "Done! App is running at http://localhost:${PORT:-3000}"
