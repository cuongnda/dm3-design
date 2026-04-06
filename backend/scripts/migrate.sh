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

# Transition: if old _schema_migrations table exists but golang-migrate's
# schema_migrations does not, seed the version from old tracking table.
OLD_TABLE_EXISTS=$(psql "$DATABASE_URL" -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_schema_migrations')")

NEW_TABLE_EXISTS=$(psql "$DATABASE_URL" -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations')")

if [ "$OLD_TABLE_EXISTS" = "t" ] && [ "$NEW_TABLE_EXISTS" = "f" ]; then
  echo "==> Migrating from old _schema_migrations to golang-migrate..."
  # Get the highest migration number that was applied
  LAST_VERSION=$(psql "$DATABASE_URL" -tAc \
    "SELECT COALESCE(MAX(CAST(SUBSTRING(filename FROM '^([0-9]+)') AS INTEGER)), 0) FROM _schema_migrations")
  echo "  Last applied version: $LAST_VERSION"

  if [ "$LAST_VERSION" -gt 0 ]; then
    # Force-set the version so golang-migrate knows where we are
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" force "$LAST_VERSION"
    echo "  Set golang-migrate version to $LAST_VERSION"
  fi

  echo "  Old tracking table preserved as _schema_migrations (can be dropped manually)"
fi

echo "==> Running migrations from $MIGRATIONS_DIR ..."
migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" up

echo "==> All migrations complete."
