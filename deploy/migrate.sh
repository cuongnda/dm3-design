#!/bin/sh
# Run all DM3 migrations idempotently.
# Called by the "migrate" service in docker-compose.prod.yml.
# Requires DATABASE_URL to be set.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"

echo "==> Creating migration tracking table if not exists..."
psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS _schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

run_migration() {
    local file="$1"
    local name
    name=$(basename "$file")

    local already_applied
    already_applied=$(psql "$DATABASE_URL" -tAc \
        "SELECT COUNT(*) FROM _schema_migrations WHERE filename = '$name'")

    if [ "$already_applied" -gt "0" ]; then
        echo "  [skip] $name (already applied)"
        return
    fi

    echo "  [apply] $name ..."
    psql "$DATABASE_URL" -f "$file"
    psql "$DATABASE_URL" -c \
        "INSERT INTO _schema_migrations (filename) VALUES ('$name')"
    echo "  [done]  $name"
}

echo "==> Running migrations from $MIGRATIONS_DIR ..."
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    run_migration "$f"
done

echo "==> All migrations complete."
