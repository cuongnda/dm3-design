#!/bin/sh
# Inject runtime config so the SPA can read API URL without a rebuild.
# Values come from environment variables set in docker-compose.prod.yml.
cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  apiUrl: "${API_URL:-}",
  mqttUrl: "${MQTT_WS_URL:-}",
};
EOF
