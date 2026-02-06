#!/bin/sh
set -e

# Fix data directory ownership if needed (runs as root initially)
chown -R appuser:appgroup /app/data 2>/dev/null || true

# Run migrations
su-exec appuser node dist/db/migrate.js

# Switch to non-root user and exec the main process
exec su-exec appuser "$@"
