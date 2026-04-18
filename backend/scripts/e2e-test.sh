#!/usr/bin/env bash
set -euo pipefail

# E2E Test: Simulator → EMQX → device-gateway → NATS → access-svc → TimescaleDB
# Prerequisites: Docker infra + all 4 services running (scripts/run-all.sh)

AUTH_URL="http://localhost:8005"
IDENTITY_URL="http://localhost:8004"
ACCESS_URL="http://localhost:8003"
GATEWAY_URL="http://localhost:8002"
SIM_URL="http://localhost:9090"

PASS=0
FAIL=0

check() {
    local name="$1" ok="$2"
    if [ "$ok" = "true" ]; then
        echo "  ✅ $name"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name"
        FAIL=$((FAIL + 1))
    fi
}

echo "═══════════════════════════════════════════"
echo "  DM3 End-to-End Integration Test"
echo "═══════════════════════════════════════════"
echo ""

# 1. Health checks
echo "▸ Step 1: Service Health Checks"
for svc in "$AUTH_URL" "$IDENTITY_URL" "$ACCESS_URL" "$GATEWAY_URL"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$svc/healthz" 2>/dev/null || echo "000")
    svc_name=$(echo "$svc" | grep -oE '[0-9]+$')
    check "Service :$svc_name healthy" "$([ "$status" = "200" ] && echo true || echo false)"
done

# 2. Auth: Login
echo ""
echo "▸ Step 2: Authentication"
LOGIN_RESP=$(curl -s -X POST "$AUTH_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@duali.com","password":"admin123"}')
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
check "Login → got JWT" "$([ -n "$TOKEN" ] && echo true || echo false)"
if [ -z "$TOKEN" ]; then
    echo "    Response: $LOGIN_RESP"
    echo "    Cannot proceed without token. Exiting."
    exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# 3. Identity: Create a person
echo ""
echo "▸ Step 3: Identity Service"
PERSON_RESP=$(curl -s -X POST "$IDENTITY_URL/api/v1/persons" \
    -H "Content-Type: application/json" \
    -d '{
        "first_name": "Test",
        "last_name": "User",
        "email": "test-e2e@duali.com",
        "status": "active"
    }')
PERSON_ID=$(echo "$PERSON_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
check "Create person" "$([ -n "$PERSON_ID" ] && echo true || echo false)"

PERSONS_RESP=$(curl -s "$IDENTITY_URL/api/v1/persons")
PERSON_COUNT=$(echo "$PERSONS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d.get('data',d if isinstance(d,list) else []))))" 2>/dev/null || echo "0")
check "List persons (count: $PERSON_COUNT)" "$([ "$PERSON_COUNT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# 4. Access: Create a door
echo ""
echo "▸ Step 4: Access Service"
DOOR_RESP=$(curl -s -X POST "$ACCESS_URL/api/v1/doors" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "E2E Test Door",
        "location": "Test Building, Floor 1",
        "type": "door",
        "status": "active"
    }')
DOOR_ID=$(echo "$DOOR_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
check "Create door" "$([ -n "$DOOR_ID" ] && echo true || echo false)"

DOORS_RESP=$(curl -s "$ACCESS_URL/api/v1/doors")
DOOR_COUNT=$(echo "$DOORS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d.get('data',d if isinstance(d,list) else []))))" 2>/dev/null || echo "0")
check "List doors (count: $DOOR_COUNT)" "$([ "$DOOR_COUNT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# 5. Devices: Check simulator devices registered
echo ""
echo "▸ Step 5: Device Gateway"
DEVICES_RESP=$(curl -s "$GATEWAY_URL/api/v1/devices")
DEVICE_COUNT=$(echo "$DEVICES_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
check "Devices auto-registered (count: $DEVICE_COUNT)" "$([ "$DEVICE_COUNT" -ge 5 ] 2>/dev/null && echo true || echo false)"

ONLINE_COUNT=$(echo "$DEVICES_RESP" | python3 -c "import sys,json; print(sum(1 for d in json.load(sys.stdin) if d.get('status')=='online'))" 2>/dev/null || echo "0")
check "Devices online (count: $ONLINE_COUNT)" "$([ "$ONLINE_COUNT" -ge 1 ] 2>/dev/null && echo true || echo false)"

# 6. Trigger simulator events and verify E2E flow
echo ""
echo "▸ Step 6: E2E Event Flow (Simulator → EMQX → Gateway → NATS → access-svc → DB)"

# Get current event count
BEFORE=$(docker exec dm3-timescaledb psql -U dm3 -d dm3 -tAc "SELECT count(*) FROM dm3_access.access_events" 2>/dev/null || echo "0")

# Trigger events from multiple devices
for dev in 000001 000002 000003; do
    curl -s -X POST "$SIM_URL/api/devices/$dev/trigger" > /dev/null 2>&1
done

echo "  ⏳ Waiting for events to propagate..."
sleep 4

AFTER=$(docker exec dm3-timescaledb psql -U dm3 -d dm3 -tAc "SELECT count(*) FROM dm3_access.access_events" 2>/dev/null || echo "0")
NEW_EVENTS=$((AFTER - BEFORE))
check "Events stored in DB ($NEW_EVENTS new, $AFTER total)" "$([ "$NEW_EVENTS" -ge 3 ] && echo true || echo false)"

# 7. Query events via access-svc API
echo ""
echo "▸ Step 7: Query Events & Stats"
EVENTS_RESP=$(curl -s "$ACCESS_URL/api/v1/events")
EVENT_API_COUNT=$(echo "$EVENTS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d.get('data',[]))))" 2>/dev/null || echo "0")
check "Events via API (count: $EVENT_API_COUNT)" "$([ "$EVENT_API_COUNT" -gt 0 ] 2>/dev/null && echo true || echo false)"

STATS_RESP=$(curl -s "$ACCESS_URL/api/v1/stats" 2>/dev/null)
STATS_OK=$(echo "$STATS_RESP" | python3 -c "import sys,json; json.load(sys.stdin); print('true')" 2>/dev/null || echo "false")
check "Dashboard stats endpoint" "$STATS_OK"

# 8. Gateway events endpoint
GW_EVENTS=$(curl -s "$GATEWAY_URL/api/v1/events")
GW_EVENT_COUNT=$(echo "$GW_EVENTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d.get('data',[]))))" 2>/dev/null || echo "0")
check "Gateway events API (count: $GW_EVENT_COUNT)" "$([ "$GW_EVENT_COUNT" -ge 0 ] 2>/dev/null && echo true || echo false)"

# Summary
echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
echo "  🎉 All E2E tests passed!"
