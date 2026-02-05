#!/bin/sh
set -e

ENV_FILE=".env"
FIRST_RUN=false

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
  FIRST_RUN=true
else
  echo ".env already exists, skipping generation."
fi

# --- Build and start ---
echo ""
echo "Building and starting services..."
docker compose up -d --build

# --- First run: create superadmin ---
if [ "$FIRST_RUN" = true ]; then
  echo ""
  echo "============================================"
  echo "  First-time setup: Create superadmin user"
  echo "============================================"
  echo ""

  printf "First name: "
  read ADMIN_FIRST_NAME
  printf "Last name: "
  read ADMIN_LAST_NAME
  printf "Email: "
  read ADMIN_EMAIL
  printf "Phone: "
  read ADMIN_PHONE
  printf "Password: "
  stty -echo 2>/dev/null || true
  read ADMIN_PASSWORD
  stty echo 2>/dev/null || true
  echo ""

  echo ""
  echo "Waiting for backend to be ready..."
  sleep 5

  # Retry until backend is ready (max 30 seconds)
  RETRIES=6
  while [ $RETRIES -gt 0 ]; do
    if docker compose exec backend sh -c "echo ok" >/dev/null 2>&1; then
      break
    fi
    echo "  Backend not ready yet, retrying..."
    sleep 5
    RETRIES=$((RETRIES - 1))
  done

  echo "Seeding database with superadmin account..."
  docker compose exec \
    -e ADMIN_EMAIL="$ADMIN_EMAIL" \
    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e ADMIN_FIRST_NAME="$ADMIN_FIRST_NAME" \
    -e ADMIN_LAST_NAME="$ADMIN_LAST_NAME" \
    -e ADMIN_PHONE="$ADMIN_PHONE" \
    backend node dist/db/seed.js

  echo ""
  echo "============================================"
  echo "  Setup complete!"
  echo ""
  echo "  URL:   http://localhost:${PORT:-3000}"
  echo "  Login: $ADMIN_EMAIL"
  echo "============================================"
else
  echo ""
  echo "Services started at http://localhost:${PORT:-3000}"
fi
