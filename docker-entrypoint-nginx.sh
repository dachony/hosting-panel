#!/bin/sh
set -e

SSL_CERT="/etc/nginx/ssl/cert.pem"
SSL_KEY="/etc/nginx/ssl/key.pem"
TEMPLATES_DIR="/etc/nginx/templates"
CONF_DIR="/etc/nginx/conf.d"

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "SSL certificates found — enabling HTTPS"
    cp "$TEMPLATES_DIR/nginx-https.conf.template" "$CONF_DIR/default.conf"
else
    echo "No SSL certificates — running HTTP only"
    cp "$TEMPLATES_DIR/nginx-http.conf.template" "$CONF_DIR/default.conf"
fi

exec nginx -g "daemon off;"
