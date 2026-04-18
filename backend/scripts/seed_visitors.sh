#!/usr/bin/env bash
# DM3 Visitor Management — API-based seed data
# Usage: ./scripts/seed_visitors.sh [BASE_URL]
# Default: http://localhost:3000

set -euo pipefail

BASE="${1:-http://localhost:3000}"
AUTH_URL="$BASE/api/v1/auth/login"
VISITOR_URL="$BASE/api/v1/visitors"
TENANT_ID="00000000-0000-0000-0000-000000000001"

echo "=== DM3 Visitor Seed ==="
echo "Base URL: $BASE"

# ─── Step 1: Login ───────────────────────────────────────────────────────────
echo ""
echo "[1/6] Logging in as admin@duali.com ..."
LOGIN_RESP=$(curl -sf "$AUTH_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@duali.com\",\"password\":\"admin123\",\"tenant_id\":\"$TENANT_ID\"}")

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo "ERROR: Login failed. Make sure admin@duali.com exists with password admin123"
  echo "Response: $LOGIN_RESP"
  exit 1
fi
echo "  OK — got JWT token"

AUTH="Authorization: Bearer $TOKEN"

# ─── Step 2: Get a host user ────────────────────────────────────────────────
echo ""
echo "[2/6] Finding host user ..."
# Get an active identity user to use as host (not the auth account ID)
IDENTITY_URL="$BASE/api/v1/identity"
USER_ID=$(curl -sf "$IDENTITY_URL/users?limit=100" -H "$AUTH" | \
  python3 -c "
import sys,json
data = json.load(sys.stdin)
users = [u for u in data.get('users',[]) if u.get('status') == 'active']
if users:
    print(users[0]['id'])
else:
    print('')
")
if [ -z "$USER_ID" ]; then
  echo "ERROR: No active identity user found to use as host"
  exit 1
fi
echo "  Host user: $USER_ID"

# ─── Step 3: Create pre-registered visits ────────────────────────────────────
echo ""
echo "[3/6] Creating pre-registered visits ..."

# Visit 1: Meeting today
VISIT1=$(curl -sf "$VISITOR_URL/visits" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{
    \"visitor\": {\"first_name\":\"John\",\"last_name\":\"Smith\",\"email\":\"john.smith@acme.com\",\"phone\":\"+1555000001\",\"company\":\"ACME Corp\"},
    \"host_user_id\":\"$USER_ID\",
    \"purpose\":\"meeting\",
    \"purpose_note\":\"Q2 project review with engineering team\",
    \"expected_arrival\":\"$(date -u -v+2H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)\",
    \"expected_departure\":\"$(date -u -v+5H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+5 hours' +%Y-%m-%dT%H:%M:%SZ)\",
    \"escort_required\":false
  }")
VISIT1_ID=$(echo "$VISIT1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Visit 1 (meeting, pre_registered): $VISIT1_ID"

# Visit 2: Interview today
VISIT2=$(curl -sf "$VISITOR_URL/visits" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{
    \"visitor\": {\"first_name\":\"Maria\",\"last_name\":\"Garcia\",\"email\":\"maria.garcia@techco.com\",\"phone\":\"+1555000002\",\"company\":\"TechCo\"},
    \"host_user_id\":\"$USER_ID\",
    \"purpose\":\"interview\",
    \"purpose_note\":\"Software Engineer position\",
    \"expected_arrival\":\"$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\",
    \"expected_departure\":\"$(date -u -v+3H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+3 hours' +%Y-%m-%dT%H:%M:%SZ)\",
    \"escort_required\":true
  }")
VISIT2_ID=$(echo "$VISIT2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Visit 2 (interview, pre_registered): $VISIT2_ID"

# Visit 3: Business partner
VISIT3=$(curl -sf "$VISITOR_URL/visits" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{
    \"visitor\": {\"first_name\":\"Tanaka\",\"last_name\":\"Yuki\",\"email\":\"yuki.tanaka@jppartner.co.jp\",\"phone\":\"+81901234567\",\"company\":\"JP Partners\"},
    \"host_user_id\":\"$USER_ID\",
    \"purpose\":\"contract_signing\",
    \"purpose_note\":\"Partnership contract discussion\",
    \"expected_arrival\":\"$(date -u -v+30M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)\",
    \"expected_departure\":\"$(date -u -v+4H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+4 hours' +%Y-%m-%dT%H:%M:%SZ)\"
  }")
VISIT3_ID=$(echo "$VISIT3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Visit 3 (business, pre_registered): $VISIT3_ID"

# Visit 4: Delivery
VISIT4=$(curl -sf "$VISITOR_URL/visits" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{
    \"visitor\": {\"first_name\":\"Kim\",\"last_name\":\"Soo-jin\",\"email\":\"soojin@krtech.kr\",\"phone\":\"+82101234567\",\"company\":\"KR Tech\"},
    \"host_user_id\":\"$USER_ID\",
    \"purpose\":\"delivery\",
    \"purpose_note\":\"Server rack delivery - Building B\",
    \"expected_arrival\":\"$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\",
    \"vehicle_plate\":\"51A-12345\"
  }")
VISIT4_ID=$(echo "$VISIT4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Visit 4 (delivery, pre_registered): $VISIT4_ID"

# ─── Step 4: Approve + checkin some visits ───────────────────────────────────
echo ""
echo "[4/6] Approving and checking in visits ..."

# Approve visit 2 (interview)
curl -sf "$VISITOR_URL/visits/$VISIT2_ID/approve" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"approved":true}' > /dev/null
echo "  Visit 2 approved"

# Approve + checkin visit 3 (business)
curl -sf "$VISITOR_URL/visits/$VISIT3_ID/approve" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"approved":true}' > /dev/null
echo "  Visit 3 approved"

curl -sf "$VISITOR_URL/visits/$VISIT3_ID/checkin" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"checkin_method":"reception","badge_number":"V-001"}' > /dev/null
echo "  Visit 3 checked in (badge V-001)"

# Approve + checkin + checkout visit 4 (delivery)
curl -sf "$VISITOR_URL/visits/$VISIT4_ID/approve" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"approved":true}' > /dev/null
curl -sf "$VISITOR_URL/visits/$VISIT4_ID/checkin" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"checkin_method":"reception"}' > /dev/null
curl -sf "$VISITOR_URL/visits/$VISIT4_ID/checkout" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"badge_returned":true,"items_returned":true}' > /dev/null
echo "  Visit 4 checked in + checked out"

# ─── Step 5: Create walk-in visit ────────────────────────────────────────────
echo ""
echo "[5/6] Creating walk-in visit ..."

WALKIN=$(curl -sf "$VISITOR_URL/walkin" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{
    \"visitor\": {\"first_name\":\"Robert\",\"last_name\":\"Johnson\",\"phone\":\"+1555000005\",\"company\":\"Global Inc\",\"national_id\":\"567890123\"},
    \"host_user_id\":\"$USER_ID\",
    \"purpose\":\"maintenance\",
    \"purpose_note\":\"AC unit maintenance in server room\",
    \"vehicle_plate\":\"30A-98765\",
    \"escort_required\":true
  }")
WALKIN_ID=$(echo "$WALKIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Walk-in visit (maintenance, waiting): $WALKIN_ID"

# ─── Step 6: Create watchlist entries ────────────────────────────────────────
echo ""
echo "[6/6] Creating watchlist entries ..."

curl -sf "$VISITOR_URL/watchlist" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"entry_type":"blacklisted","match_field":"name","match_value":"David Blackwell","reason":"Previous security incident - unauthorized area access"}' > /dev/null
echo "  Watchlist: name=David Blackwell"

curl -sf "$VISITOR_URL/watchlist" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"entry_type":"blacklisted","match_field":"email","match_value":"banned@suspicious.com","reason":"Fraudulent identity documents"}' > /dev/null
echo "  Watchlist: email=banned@suspicious.com"

curl -sf "$VISITOR_URL/watchlist" \
  -X POST -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"entry_type":"blacklisted","match_field":"national_id","match_value":"999888777","reason":"Linked to security incident"}' > /dev/null
echo "  Watchlist: national_id=999888777"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
SUMMARY=$(curl -sf "$VISITOR_URL/today/summary" -H "$AUTH")
echo "Today's summary: $SUMMARY"
echo ""
echo "Seed complete! Created:"
echo "  - 5 visitors (John Smith, Maria Garcia, Tanaka Yuki, Kim Soo-jin, Robert Johnson)"
echo "  - 5 visits:"
echo "    - Visit 1: pre_registered (meeting)"
echo "    - Visit 2: approved (interview)"
echo "    - Visit 3: checked_in (contract_signing, badge V-001)"
echo "    - Visit 4: checked_out (delivery)"
echo "    - Walk-in: waiting (maintenance, vehicle 30A-98765)"
echo "  - 3 watchlist entries"
