#!/bin/bash
set -e

###############################################################################
# DM3 Automation Container Entrypoint
#
# 1. Wait for DM3 services to become healthy
# 2. Detect changed test modules from git commit → run only those
# 3. Configure cron for daily full test run
# 4. Stay alive (cron foreground)
###############################################################################

# ── Config from environment (.env.docker) ────────────────────────────────────
CRON_SCHEDULE="${CRON_SCHEDULE:-0 0 * * *}"
RUN_ON_STARTUP="${RUN_ON_STARTUP:-changed}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
API_BASE_URL="${API_BASE_URL:-http://device-gateway:8002}"
WEB_BASE_URL="${WEB_BASE_URL:-http://webapp:3000}"
TZ="${TZ:-Asia/Bangkok}"

echo "============================================================"
echo "  DM3 Automation Container"
echo "============================================================"
echo "  Time     : $(date)"
echo "  Timezone : ${TZ}"
echo "  Startup  : ${RUN_ON_STARTUP}"
echo "  Cron     : ${CRON_SCHEDULE}"
echo "  API URL  : ${API_BASE_URL}"
echo "  Web URL  : ${WEB_BASE_URL}"
echo "  Commit   : ${CI_COMMIT_SHA:-unknown}"
echo "============================================================"

# ── STEP 1: Wait for services ───────────────────────────────────────────────
echo ""
echo "[1/3] Waiting for services to be healthy..."

WAITED=0
while [ "$WAITED" -lt "$HEALTH_TIMEOUT" ]; do
    API_OK=$(curl -sf -o /dev/null "${API_BASE_URL}/healthz" 2>/dev/null && echo "1" || echo "0")
    WEB_OK=$(curl -sf -o /dev/null "${WEB_BASE_URL}" 2>/dev/null && echo "1" || echo "0")

    if [ "$API_OK" = "1" ] && [ "$WEB_OK" = "1" ]; then
        echo "  ✓ Services ready (${WAITED}s)"
        break
    fi

    sleep 5
    WAITED=$((WAITED + 5))
    echo "  ... waiting (${WAITED}s) API=${API_OK} WEB=${WEB_OK}"
done

if [ "$WAITED" -ge "$HEALTH_TIMEOUT" ]; then
    echo "  ⚠ Services not fully ready after ${HEALTH_TIMEOUT}s — proceeding anyway"
fi

# ── STEP 2: Startup test run ────────────────────────────────────────────────
echo ""
echo "[2/3] Startup test run (mode: ${RUN_ON_STARTUP})..."

case "$RUN_ON_STARTUP" in

  changed)
    # Detect which modules changed in the latest commit
    MODULES=""

    if [ -n "$CI_COMMIT_SHA" ] && [ -n "$CI_COMMIT_BEFORE_SHA" ] && [ -d "/app/.git" ]; then
        cd /app
        CHANGED=$(git diff --name-only "$CI_COMMIT_BEFORE_SHA" "$CI_COMMIT_SHA" 2>/dev/null || echo "")
        cd /app/automation

        if [ -n "$CHANGED" ]; then
            echo "  Changed files:"
            echo "$CHANGED" | head -20 | sed 's/^/    /'

            for file in $CHANGED; do
                case "$file" in
                    # ── Test file changes → run that module ──
                    automation/tests/api/test_access_time.py)           MODULES="$MODULES access-time" ;;
                    automation/tests/api/test_account_management.py)    MODULES="$MODULES account-management" ;;
                    automation/tests/api/test_company_crud.py)          MODULES="$MODULES company-crud" ;;
                    automation/tests/api/test_system_admin.py)          MODULES="$MODULES system-admin" ;;
                    automation/tests/web/*/test_system_login.py)        MODULES="$MODULES system-login" ;;
                    automation/tests/web/*/test_company_management.py)  MODULES="$MODULES company-management" ;;
                    automation/tests/web/*/test_account_management.py)  MODULES="$MODULES account-management" ;;

                    # ── Backend changes → run related API tests ──
                    backend/internal/access/*)    MODULES="$MODULES access-time" ;;
                    backend/internal/identity/*)  MODULES="$MODULES account-management system-admin" ;;
                    backend/internal/company/*)   MODULES="$MODULES company-crud" ;;

                    # ── Frontend changes → run related web tests ──
                    apps/console/src/features/secure/*)   MODULES="$MODULES access-time" ;;
                    apps/console/src/features/system/*)   MODULES="$MODULES company-management account-management system-login" ;;

                    # ── Common/framework changes → full run ──
                    automation/conftest.py|automation/common/*|automation/daily_runner.py)
                        MODULES="FULL"
                        break
                        ;;
                esac
            done
        fi
    else
        echo "  No CI commit info available — skipping"
    fi

    # Deduplicate and run
    if [ "$MODULES" = "FULL" ]; then
        echo "  Framework changed → running FULL test suite"
        python daily_runner.py --once 2>&1 | tee /var/log/automation-startup.log || true
    elif [ -n "$MODULES" ]; then
        MODULES=$(echo "$MODULES" | tr ' ' '\n' | sort -u | tr '\n' ' ')
        echo "  Modules to test: ${MODULES}"
        for mod in $MODULES; do
            echo ""
            echo "  ── Running: ${mod} ──"
            python daily_runner.py --module "$mod" 2>&1 | tee -a /var/log/automation-startup.log || true
        done
    else
        echo "  No test-related changes detected — skipping"
    fi
    ;;

  full)
    echo "  Running full test suite..."
    python daily_runner.py --once 2>&1 | tee /var/log/automation-startup.log || true
    echo ""
    echo "  Generating Excel reports..."
    python generate_excel_report.py --output-dir /app/automation/export 2>&1 | tee -a /var/log/automation-startup.log || true
    ;;

  none)
    echo "  Skipping startup run (RUN_ON_STARTUP=none)"
    ;;

  *)
    echo "  Unknown RUN_ON_STARTUP='${RUN_ON_STARTUP}' — skipping"
    ;;
esac

# ── STEP 3: Configure cron ──────────────────────────────────────────────────
echo ""
echo "[3/3] Configuring cron schedule..."

# Export environment for cron (cron doesn't inherit process env)
printenv | grep -E '^(API_|WEB_|REPORT_|HOST_|TZ|PATH|HOME|PYTHONPATH|GENERATE_|DISPLAY)' \
    > /etc/environment

# Write dynamic crontab from CRON_SCHEDULE env var
cat > /etc/cron.d/dm3-automation << CRONEOF
# DM3 Automation — daily full test run
# Schedule: ${CRON_SCHEDULE} (${TZ})
${CRON_SCHEDULE} root cd /app/automation && /usr/local/bin/python daily_runner.py --once >> /var/log/automation-cron.log 2>&1

# Empty line required by cron
CRONEOF

chmod 0644 /etc/cron.d/dm3-automation
crontab /etc/cron.d/dm3-automation

echo "  ✓ Cron configured: '${CRON_SCHEDULE}' (${TZ})"
echo ""
echo "============================================================"
echo "  Automation container ready"
echo "  Logs: docker logs dm3-automation"
echo "  Cron log: /var/log/automation-cron.log"
echo "============================================================"
echo ""

# ── Stay alive: cron in foreground ──────────────────────────────────────────
exec cron -f
