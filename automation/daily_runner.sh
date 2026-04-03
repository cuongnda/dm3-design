#!/bin/bash

# =============================================================================
# DM3 Daily Test Runner
# =============================================================================
#
# Usage:
#   ./daily_runner.sh              # Run in foreground (default)
#   ./daily_runner.sh start        # Start in background
#   ./daily_runner.sh stop         # Stop automation
#   ./daily_runner.sh status       # Check if running
#   ./daily_runner.sh logs         # View logs (tail -f)
#   ./daily_runner.sh cleanup      # Clean old export files
#
# Pipeline: test -> screenshots -> video -> report -> upload
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Detect Python
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "Error: Python not found."
    exit 1
fi

PID_FILE="$SCRIPT_DIR/.daily_runner.pid"
LOG_FILE="$SCRIPT_DIR/logs/daily_runner.log"

mkdir -p "$SCRIPT_DIR/logs"
mkdir -p "$SCRIPT_DIR/export"

# Load .env
load_env() {
    if [ -f ".env" ]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
            if [[ "$line" == *"="* ]]; then
                key=$(echo "$line" | cut -d'=' -f1 | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
                value=$(echo "$line" | cut -d'=' -f2- | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
                export "$key"="$value"
            fi
        done < ".env"
    fi
}

# Activate venv
activate_venv() {
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    else
        echo "No venv found. Creating..."
        $PYTHON -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
        playwright install chromium
    fi
}

start_foreground() {
    echo "=============================================="
    echo "  DM3 DAILY TEST RUNNER"
    echo "=============================================="
    echo "  Pipeline: test -> screenshot -> video -> report -> upload"
    echo "  Press Ctrl+C to stop"
    echo "=============================================="
    echo ""

    activate_venv
    load_env
    export GENERATE_VIDEO=true
    export HEADLESS=true

    $PYTHON daily_runner.py --watch
}

start_background() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Already running (PID $(cat $PID_FILE))"
        return
    fi

    activate_venv
    load_env
    export GENERATE_VIDEO=true
    export HEADLESS=true

    echo "Starting in background..."
    nohup $PYTHON daily_runner.py --watch >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Started (PID $!). Logs: $LOG_FILE"
}

stop_automation() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "Stopped (PID $PID)"
        else
            echo "Process $PID not running"
        fi
        rm -f "$PID_FILE"
    else
        echo "Not running (no PID file)"
    fi
}

check_status() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Running (PID $(cat $PID_FILE))"
    else
        echo "Not running"
    fi
}

view_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "No log file: $LOG_FILE"
    fi
}

run_once() {
    activate_venv
    load_env
    export GENERATE_VIDEO=true
    export HEADLESS=true

    $PYTHON daily_runner.py
}

run_api() {
    activate_venv
    load_env
    export HEADLESS=true

    $PYTHON daily_runner.py --api
}

run_web() {
    activate_venv
    load_env
    export GENERATE_VIDEO=true
    export HEADLESS=true

    $PYTHON daily_runner.py --web
}

cleanup_files() {
    activate_venv
    load_env
    $PYTHON -c "from daily_runner import cleanup_old_files; cleanup_old_files()"
    echo "Cleanup done"
}

show_help() {
    echo "Usage: ./daily_runner.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (none)     Run watch mode in foreground"
    echo "  start      Start watch mode in background"
    echo "  stop       Stop background automation"
    echo "  restart    Stop then start"
    echo "  status     Check if running"
    echo "  run        Run once (all tests)"
    echo "  run-api    Run once (API tests only)"
    echo "  run-web    Run once (web tests only)"
    echo "  logs       Tail log file"
    echo "  cleanup    Clean old export files"
    echo "  help       Show this help"
}

case "${1:-}" in
    start)       start_background ;;
    stop)        stop_automation ;;
    restart)     stop_automation; sleep 1; start_background ;;
    status)      check_status ;;
    run)         run_once ;;
    run-api)     run_api ;;
    run-web)     run_web ;;
    logs|log)    view_logs ;;
    cleanup)     cleanup_files ;;
    help|-h|--help) show_help ;;
    *)           start_foreground ;;
esac
