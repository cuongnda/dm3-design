#!/bin/sh
# Run DM3 database migrations using golang-migrate.
# Called by the "migrate" service in docker-compose.prod.yml.
# Requires DATABASE_URL to be set.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"

# Wait for DB to be truly ready (healthcheck may pass before accepting queries)
echo "==> Waiting for database..."
for i in 1 2 3 4 5; do
  if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "  Database ready."
    break
  fi
  echo "  Attempt $i: not ready, waiting 2s..."
  sleep 2
done

# Fix dirty state: if a previous migration run crashed mid-way, force back to
# the last clean version so the next run can retry the failed migration.
DIRTY=$(psql "$DATABASE_URL" -tAc \
  "SELECT dirty FROM schema_migrations LIMIT 1" 2>/dev/null || echo "")
if [ "$DIRTY" = "t" ]; then
  CURRENT_VERSION=$(psql "$DATABASE_URL" -tAc \
    "SELECT version FROM schema_migrations LIMIT 1" 2>/dev/null || echo "")
  PREV_VERSION=$(( CURRENT_VERSION - 1 ))
  echo "==> WARNING: dirty migration state at version $CURRENT_VERSION, rolling back to $PREV_VERSION..."
  migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" force "$PREV_VERSION"
fi

echo "==> Running migrations from $MIGRATIONS_DIR ..."
migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" up

echo "==> All migrations complete."
