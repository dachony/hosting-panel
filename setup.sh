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

  # Prompt for required fields
  prompt_required() {
    value=""
    while [ -z "$value" ]; do
      printf "%s: " "$1"
      read value
      if [ -z "$value" ]; then
        echo "  This field is required."
      fi
    done
    echo "$value"
  }

  prompt_password() {
    value=""
    while [ -z "$value" ]; do
      printf "%s: " "$1"
      stty -echo 2>/dev/null || true
      read value
      stty echo 2>/dev/null || true
      echo ""
      if [ -z "$value" ]; then
        echo "  This field is required."
      elif [ ${#value} -lt 6 ]; then
        echo "  Password must be at least 6 characters."
        value=""
      fi
    done
    echo "$value"
  }

  ADMIN_FIRST_NAME=$(prompt_required "First name")
  ADMIN_LAST_NAME=$(prompt_required "Last name")
  ADMIN_EMAIL=$(prompt_required "Email")
  ADMIN_PHONE=$(prompt_required "Phone")
  ADMIN_PASSWORD=$(prompt_password "Password")

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
