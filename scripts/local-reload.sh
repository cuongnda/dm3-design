#!/bin/bash
# local-reload.sh — Rebuild and reload the local DM3 Docker stack
#
# Usage:
#   ./scripts/local-reload.sh              # rebuild backend + reload nginx
#   ./scripts/local-reload.sh --backend    # rebuild backend services only
#   ./scripts/local-reload.sh --frontend   # rebuild webapp + reload nginx
#   ./scripts/local-reload.sh --all        # rebuild everything
#   ./scripts/local-reload.sh --restart    # restart services without rebuild
#
# Can be called by git post-commit hook for auto-reload on commits.

set -euo pipefail

COMPOSE_FILE="docker-compose.local.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Backend Go services built from backend/Dockerfile. Add new services here
# (and only here) so build/restart/health-check lists stay in sync.
BACKEND_SERVICES=(auth-svc identity-svc access-svc device-gateway audit-svc visitor-svc parking-svc cctv-svc attend-svc)

# Compose interpolates ${VAR} at parse time — if any required var is unset,
# every `docker compose ...` call fails before it even looks at the target
# service. Source .env.local first so the developer's real local secrets
# take precedence; then provide safe local-dev defaults (`:=` only fills
# what's still unset) so the reload script works on a fresh checkout.
#
# NOTE: CCTV_CREDENTIAL_KEY must be valid base64 — cctv-svc base64-decodes
# it at startup and crashes on invalid input. The default below is
# openssl rand -base64 32 (valid, deterministic, NOT for production).
if [[ -f .env.local ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
fi
: "${MEDIAMTX_STREAM_PASS:=dev-stream-pass}"
: "${MEDIAMTX_API_PASS:=dev-api-pass}"
: "${CCTV_CREDENTIAL_KEY:=ZGV2LWNjdHYta2V5LWRldi1vbmx5LW5vdC1mb3ItcHJvZA==}"
export MEDIAMTX_STREAM_PASS MEDIAMTX_API_PASS CCTV_CREDENTIAL_KEY

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[dm3-reload]${NC} $*"; }
ok()   { echo -e "${GREEN}[dm3-reload]${NC} $*"; }
warn() { echo -e "${YELLOW}[dm3-reload]${NC} $*"; }
err()  { echo -e "${RED}[dm3-reload]${NC} $*" >&2; }

MODE="${1:---backend}"

# Check if stack is running
if ! docker compose -f "$COMPOSE_FILE" ps --quiet nginx > /dev/null 2>&1; then
    err "Local stack is not running. Start it first:"
    err "  docker compose -f $COMPOSE_FILE up -d"
    exit 1
fi

# Ensure infra is healthy before rebuilding
check_infra() {
    log "Checking infrastructure..."
    local infra_ok=true
    for svc in timescaledb nats emqx valkey minio; do
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "dm3-local-$svc" 2>/dev/null || echo "missing")
        if [ "$status" != "healthy" ]; then
            warn "$svc is $status — restarting..."
            docker compose -f "$COMPOSE_FILE" up -d "$svc" > /dev/null 2>&1
            infra_ok=false
        fi
    done

    if [ "$infra_ok" = false ]; then
        log "Waiting for infra to become healthy..."
        local retries=30
        while [ $retries -gt 0 ]; do
            local all_healthy=true
            for svc in timescaledb nats emqx valkey minio; do
                local status
                status=$(docker inspect --format='{{.State.Health.Status}}' "dm3-local-$svc" 2>/dev/null || echo "missing")
                if [ "$status" != "healthy" ]; then
                    all_healthy=false
                    break
                fi
            done
            if [ "$all_healthy" = true ]; then
                ok "Infrastructure healthy."
                return 0
            fi
            retries=$((retries - 1))
            sleep 2
        done
        err "Infrastructure failed to become healthy after 60s."
        exit 1
    fi
    ok "Infrastructure healthy."
}

# Rebuild and restart backend services
reload_backend() {
    check_infra

    log "Rebuilding backend images (migrate + all services)..."
    # All backend services share the same Dockerfile but have separate image tags,
    # so every service must be rebuilt — otherwise migrate (and per-service) images
    # go stale and migration files added after the last build will be missing.
    docker compose -f "$COMPOSE_FILE" build --quiet \
        migrate "${BACKEND_SERVICES[@]}" 2>&1 | tail -3

    log "Running migrations..."
    docker compose -f "$COMPOSE_FILE" up -d migrate 2>/dev/null
    docker compose -f "$COMPOSE_FILE" wait migrate 2>/dev/null || true
    # Verify migrate exited cleanly — if not, abort before services try to start against a broken schema.
    local migrate_exit
    migrate_exit=$(docker inspect --format='{{.State.ExitCode}}' dm3-local-migrate 2>/dev/null || echo "1")
    if [ "$migrate_exit" != "0" ]; then
        err "Migrate container failed (exit $migrate_exit). Last logs:"
        docker logs dm3-local-migrate --tail 20 2>&1 | sed 's/^/  /'
        exit 1
    fi

    log "Restarting backend services..."
    docker compose -f "$COMPOSE_FILE" up -d \
        "${BACKEND_SERVICES[@]}" 2>&1 | tail -5

    # Wait for services to be healthy
    log "Waiting for services to become healthy..."
    local retries=30
    while [ $retries -gt 0 ]; do
        local all_healthy=true
        for svc in "${BACKEND_SERVICES[@]}"; do
            local status
            status=$(docker inspect --format='{{.State.Health.Status}}' "dm3-local-$svc" 2>/dev/null || echo "missing")
            if [ "$status" != "healthy" ]; then
                all_healthy=false
                break
            fi
        done
        if [ "$all_healthy" = true ]; then
            ok "All backend services healthy."
            return 0
        fi
        retries=$((retries - 1))
        sleep 2
    done
    warn "Some services may still be starting (timeout after 60s)."
}

# Rebuild and restart frontend
reload_frontend() {
    log "Rebuilding webapp..."
    docker compose -f "$COMPOSE_FILE" build --quiet webapp 2>&1 | tail -3

    log "Restarting webapp..."
    docker compose -f "$COMPOSE_FILE" up -d webapp 2>&1

    log "Reloading nginx..."
    docker exec dm3-local-nginx nginx -s reload 2>/dev/null || \
        docker compose -f "$COMPOSE_FILE" restart nginx 2>&1
    ok "Frontend reloaded."
}

# Restart without rebuild
restart_only() {
    check_infra

    log "Restarting all services (no rebuild)..."
    docker compose -f "$COMPOSE_FILE" restart \
        "${BACKEND_SERVICES[@]}" 2>&1

    log "Reloading nginx..."
    docker exec dm3-local-nginx nginx -s reload 2>/dev/null || true
    ok "Services restarted."
}

case "$MODE" in
    --backend|-b)
        log "Rebuilding backend services..."
        reload_backend
        ;;
    --frontend|-f)
        log "Rebuilding frontend..."
        reload_frontend
        ;;
    --all|-a)
        log "Full stack rebuild..."
        reload_backend
        reload_frontend
        ;;
    --restart|-r)
        restart_only
        ;;
    *)
        err "Unknown option: $MODE"
        echo "Usage: $0 [--backend|--frontend|--all|--restart]"
        exit 1
        ;;
esac

ok "Done! Stack is ready at http://localhost:3000"
