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

# Transition: if old _schema_migrations table exists but golang-migrate's
# schema_migrations does not, seed the version from old tracking table.
OLD_TABLE_EXISTS=$(psql "$DATABASE_URL" -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_schema_migrations')" 2>/dev/null || echo "f")

NEW_TABLE_EXISTS=$(psql "$DATABASE_URL" -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations')" 2>/dev/null || echo "f")

if [ "$OLD_TABLE_EXISTS" = "t" ] && [ "$NEW_TABLE_EXISTS" = "f" ]; then
  echo "==> Migrating from old _schema_migrations to golang-migrate..."
  LAST_VERSION=$(psql "$DATABASE_URL" -tAc \
    "SELECT COALESCE(MAX(CAST(SUBSTRING(filename FROM '^([0-9]+)') AS INTEGER)), 0) FROM _schema_migrations" 2>/dev/null || echo "0")
  echo "  Last applied version: $LAST_VERSION"

  if [ "$LAST_VERSION" -gt 0 ] 2>/dev/null; then
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" force "$LAST_VERSION"
    echo "  Set golang-migrate version to $LAST_VERSION"
  fi

  echo "  Old tracking table preserved as _schema_migrations (can be dropped manually)"
fi

# Fix dirty migration state if present
DIRTY=$(psql "$DATABASE_URL" -tAc \
  "SELECT dirty FROM schema_migrations LIMIT 1" 2>/dev/null || echo "")
if [ "$DIRTY" = "t" ]; then
  echo "==> WARNING: dirty migration state detected, forcing clean..."
  VERSION=$(psql "$DATABASE_URL" -tAc "SELECT version FROM schema_migrations LIMIT 1")
  migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" force "$VERSION"
  echo "  Forced version $VERSION to clean state."
fi

echo "==> Running migrations from $MIGRATIONS_DIR ..."
migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" up

echo "==> All migrations complete."
