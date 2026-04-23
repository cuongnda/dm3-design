#!/usr/bin/env bash
#
# sync-prod-to-local.sh
#
# Dump the DM3 production TimescaleDB and restore it over the local dev DB.
# Handles TimescaleDB's pre_restore / post_restore dance automatically.
#
# Usage:
#   scripts/sync-prod-to-local.sh                 # dump fresh then restore
#   scripts/sync-prod-to-local.sh --skip-dump     # reuse latest backup file
#   scripts/sync-prod-to-local.sh --file PATH     # use a specific dump file
#   scripts/sync-prod-to-local.sh --dry-run       # show what would happen
#   scripts/sync-prod-to-local.sh --yes           # skip confirmation prompt
#
# Requirements:
#   - SSH key at $PROD_SSH_KEY (default: ~/.ssh/AWS-Duali.pem)
#   - Local stack running: docker compose -f docker-compose.local.yml up -d timescaledb
#
set -euo pipefail

# ---------- config ----------
PROD_HOST="${PROD_HOST:-ubuntu@dm3.demasterpro.com}"
PROD_SSH_KEY="${PROD_SSH_KEY:-$HOME/.ssh/AWS-Duali.pem}"
PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-dm3-timescaledb}"

LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINER:-dm3-local-timescaledb}"
LOCAL_DB_USER="${LOCAL_DB_USER:-dm3}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-dm3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/.prod-backups}"

# DM3 owns these schemas. Everything else (public, _timescaledb_*) stays.
DM3_SCHEMAS=(dm3_auth dm3_devices dm3_access dm3_identity dm3_visitor dm3_parking dm3_cctv dm3_attendance dm3_audit)

# ---------- arg parsing ----------
SKIP_DUMP=0
DRY_RUN=0
ASSUME_YES=0
DUMP_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-dump)  SKIP_DUMP=1; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --yes|-y)     ASSUME_YES=1; shift ;;
    --file)       DUMP_FILE="$2"; shift 2 ;;
    -h|--help)    sed -n '1,20p' "$0"; exit 0 ;;
    *)            echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---------- helpers ----------
log()  { printf '\033[1;34m[sync]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[err]\033[0m  %s\n' "$*" >&2; exit 1; }
run()  { if [[ $DRY_RUN -eq 1 ]]; then echo "+ $*"; else eval "$@"; fi; }

psql_local() {
  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

# psql against the maintenance 'postgres' db (for DROP/CREATE DATABASE dm3)
psql_local_admin() {
  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -v ON_ERROR_STOP=1 "$@"
}

count_rows_prod() {
  ssh -i "$PROD_SSH_KEY" -o StrictHostKeyChecking=no "$PROD_HOST" \
    "docker exec $PROD_DB_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME -At -c \"$1\""
}
count_rows_local() {
  docker exec "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -At -c "$1"
}

# ---------- preflight ----------
[[ -f "$PROD_SSH_KEY" ]] || die "SSH key not found: $PROD_SSH_KEY"
docker ps --format '{{.Names}}' | grep -qx "$LOCAL_DB_CONTAINER" \
  || die "Local DB container '$LOCAL_DB_CONTAINER' not running"

mkdir -p "$BACKUP_DIR"

# ---------- resolve dump file ----------
if [[ -n "$DUMP_FILE" ]]; then
  [[ -f "$DUMP_FILE" ]] || die "Dump file not found: $DUMP_FILE"
elif [[ $SKIP_DUMP -eq 1 ]]; then
  DUMP_FILE="$(ls -1t "$BACKUP_DIR"/dm3-prod-*.sql 2>/dev/null | head -n1 || true)"
  [[ -n "$DUMP_FILE" ]] || die "--skip-dump set but no backup found in $BACKUP_DIR"
  log "Reusing latest backup: $DUMP_FILE"
else
  DUMP_FILE="$BACKUP_DIR/dm3-prod-$(date +%Y%m%d-%H%M%S).sql"
fi

# ---------- dump ----------
# NOTE: no --clean / --if-exists. Those emit DROP EXTENSION timescaledb mid-dump,
# which breaks the pre_restore → restore flow on the target. Instead we DROP
# DATABASE locally before restoring, so the target is always a fresh DB.
if [[ $SKIP_DUMP -eq 0 && ! -f "$DUMP_FILE" ]]; then
  log "Dumping prod → $DUMP_FILE"
  run "ssh -i '$PROD_SSH_KEY' -o StrictHostKeyChecking=no '$PROD_HOST' \
       'docker exec $PROD_DB_CONTAINER pg_dump -U $LOCAL_DB_USER -d $LOCAL_DB_NAME \
          --no-owner --no-privileges --format=plain' > '$DUMP_FILE'"
  [[ $DRY_RUN -eq 1 ]] || [[ -s "$DUMP_FILE" ]] || die "Dump file is empty: $DUMP_FILE"
fi

DUMP_SIZE="$( [[ -f "$DUMP_FILE" ]] && du -h "$DUMP_FILE" | awk '{print $1}' || echo '?' )"
log "Dump: $DUMP_FILE ($DUMP_SIZE)"

# ---------- confirm ----------
if [[ $ASSUME_YES -eq 0 && $DRY_RUN -eq 0 ]]; then
  echo
  warn "About to DROP and overwrite local schemas: ${DM3_SCHEMAS[*]}"
  warn "Local DB: $LOCAL_DB_CONTAINER / $LOCAL_DB_NAME"
  read -r -p "Proceed? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted."
fi

# ---------- restore ----------
# The prod dump has `--clean --if-exists` which emits `DROP EXTENSION timescaledb`
# mid-file, but references `_timescaledb_internal` chunks earlier in the same file.
# Cleanest path: drop and recreate the database entirely, install the extension
# fresh, then pre_restore → restore → post_restore.
log "Dropping and recreating database '$LOCAL_DB_NAME' (FORCE kills live sessions)"
if [[ $DRY_RUN -eq 0 ]]; then
  # PG13+: WITH (FORCE) terminates active sessions atomically
  psql_local_admin -c "DROP DATABASE IF EXISTS $LOCAL_DB_NAME WITH (FORCE);"
  psql_local_admin -c "CREATE DATABASE $LOCAL_DB_NAME OWNER $LOCAL_DB_USER;"
fi

log "Installing timescaledb extension"
[[ $DRY_RUN -eq 0 ]] && psql_local -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" > /dev/null

log "timescaledb_pre_restore()"
[[ $DRY_RUN -eq 0 ]] && psql_local -c "SELECT timescaledb_pre_restore();" > /dev/null

log "Restoring dump (may take a minute)..."
if [[ $DRY_RUN -eq 0 ]]; then
  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" \
    -v ON_ERROR_STOP=0 --quiet < "$DUMP_FILE" \
    2> >(grep -Ev 'NOTICE:|does not exist, skipping|already exists' >&2) \
    > /dev/null
fi

log "timescaledb_post_restore()"
[[ $DRY_RUN -eq 0 ]] && psql_local -c "SELECT timescaledb_post_restore();" > /dev/null

# ---------- verify ----------
log "Row-count diff (prod vs local) for key tables:"
printf '  %-45s %12s %12s  %s\n' TABLE PROD LOCAL DELTA
TABLES=(
  "dm3_auth.accounts"
  "dm3_auth.tenants"
  "dm3_identity.users"
  "dm3_identity.credentials"
  "dm3_devices.devices"
  "dm3_access.access_points"
  "dm3_access.access_point_devices"
  "dm3_access.access_devices"
  "dm3_access.access_events"
  "dm3_audit.audit_logs"
)
if [[ $DRY_RUN -eq 0 ]]; then
  for t in "${TABLES[@]}"; do
    p=$(count_rows_prod  "SELECT count(*) FROM $t;" 2>/dev/null || echo "?")
    l=$(count_rows_local "SELECT count(*) FROM $t;" 2>/dev/null || echo "?")
    d="?"
    [[ "$p" =~ ^[0-9]+$ && "$l" =~ ^[0-9]+$ ]] && d=$((l - p))
    printf '  %-45s %12s %12s  %s\n' "$t" "$p" "$l" "$d"
  done
fi

log "Done."
