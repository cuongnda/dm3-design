#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_DIR/bin"
LOG_DIR="$PROJECT_DIR/data/logs"
PID_DIR="$PROJECT_DIR/data/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

# Common env
export DATABASE_URL="${DATABASE_URL:-postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable}"
export MQTT_BROKER="${MQTT_BROKER:-tcp://localhost:1884}"
export NATS_URL="${NATS_URL:-nats://localhost:4222}"
export JWT_SECRET="${JWT_SECRET:-dm3-dev-secret-key}"
export VALKEY_URL="${VALKEY_URL:-localhost:6379}"

SERVICES="auth-svc identity-svc access-svc device-gateway"
PORTS="8005 8004 8003 8002"

stop_all() {
    echo "Stopping all services..."
    for svc in $SERVICES; do
        if [ -f "$PID_DIR/$svc.pid" ]; then
            pid=$(cat "$PID_DIR/$svc.pid")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                echo "  Stopped $svc (pid $pid)"
            fi
            rm -f "$PID_DIR/$svc.pid"
        fi
    done
}

if [ "${1:-}" = "stop" ]; then
    stop_all
    exit 0
fi

# Stop any existing instances
stop_all

# Start services
svc_arr=($SERVICES)
port_arr=($PORTS)

for i in "${!svc_arr[@]}"; do
    svc="${svc_arr[$i]}"
    port="${port_arr[$i]}"
    echo "Starting $svc on :$port..."
    HTTP_PORT="$port" "$BIN_DIR/$svc" > "$LOG_DIR/$svc.log" 2>&1 &
    echo $! > "$PID_DIR/$svc.pid"
    sleep 1
done

echo ""
echo "All services started. Checking health..."
sleep 2

for i in "${!svc_arr[@]}"; do
    svc="${svc_arr[$i]}"
    port="${port_arr[$i]}"
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/healthz" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo "  ✅ $svc (:$port) — healthy"
    else
        echo "  ❌ $svc (:$port) — HTTP $status"
        echo "     Log: tail $LOG_DIR/$svc.log"
    fi
done

echo ""
echo "Logs: $LOG_DIR/"
echo "Stop: $0 stop"
