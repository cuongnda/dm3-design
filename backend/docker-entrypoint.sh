#!/bin/sh
set -e

case "${SERVICE_NAME}" in
  device-gateway)
    exec /app/bin/device-gateway "$@"
    ;;
  access-svc)
    exec /app/bin/access-svc "$@"
    ;;
  identity-svc)
    exec /app/bin/identity-svc "$@"
    ;;
  auth-svc)
    exec /app/bin/auth-svc "$@"
    ;;
  migrate)
    exec /app/scripts/migrate.sh "$@"
    ;;
  *)
    echo "ERROR: SERVICE_NAME must be one of: device-gateway, access-svc, identity-svc, auth-svc, migrate" >&2
    exit 1
    ;;
esac
