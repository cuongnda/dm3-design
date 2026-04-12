#!/usr/bin/env bash
# ============================================================
# DM3 Comprehensive Seed — API-based
# Seeds all modules through REST API endpoints.
# Only uses SQL for bootstrap (system admin account).
#
# Usage: ./scripts/seed_all.sh
# Requires: curl, jq, docker (for bootstrap SQL)
# ============================================================

set -uo pipefail

BASE_URL="${DM3_BASE_URL:-http://localhost:3000}"
SYSADMIN_EMAIL="sysadmin@duali.com"
SYSADMIN_PASS="admin123"
ADMIN_EMAIL="admin@duali.com"
ADMIN_PASS="admin123"
MANAGER_EMAIL="manager@duali.com"
OPERATOR_EMAIL="operator@duali.com"
VIEWER_EMAIL="viewer@duali.com"
BCRYPT_HASH='$2a$10$8Ksyju7fGMyl3R8SRWw0zuEmbQfmQdY8itEVsfsvOIV61GUmn.Pqm'

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

# POST helper: post URL DATA [TOKEN]
api_post() {
  local url="$1" data="$2" token="${3:-}"
  local -a args=(curl -s -X POST "${BASE_URL}${url}" -H "Content-Type: application/json")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  args+=(-d "$data")
  "${args[@]}"
}

# PUT helper
api_put() {
  local url="$1" data="$2" token="${3:-}"
  local -a args=(curl -s -X PUT "${BASE_URL}${url}" -H "Content-Type: application/json")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  args+=(-d "$data")
  "${args[@]}"
}

# GET helper
api_get() {
  local url="$1" token="${2:-}"
  local -a args=(curl -s "${BASE_URL}${url}")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  "${args[@]}"
}

# Login helper: returns access_token
do_login() {
  local email="$1" password="$2" tenant_id="${3:-}"
  local resp
  resp=$(api_post "/api/v1/auth/login" "{\"email\":\"$email\",\"password\":\"$password\"}")
  local step
  step=$(echo "$resp" | jq -r '.step // empty')

  if [[ "$step" == "select_company" ]]; then
    local temp_token
    temp_token=$(echo "$resp" | jq -r '.temporary_token')
    if [[ -z "$tenant_id" ]]; then
      tenant_id=$(echo "$resp" | jq -r '.companies[0].id')
    fi
    resp=$(api_post "/api/v1/auth/login-step2" "{\"temporary_token\":\"$temp_token\",\"tenant_id\":\"$tenant_id\"}")
  fi

  echo "$resp" | jq -r '.access_token // empty'
}

echo "============================================"
echo " DM3 Comprehensive Seed (API-based)"
echo "============================================"
echo ""

# ============================================================
# 0. CLEANUP + BOOTSTRAP
# ============================================================
echo "Phase 0: Cleanup & Bootstrap..."
docker exec -i dm3-local-timescaledb psql -U dm3 -d dm3 -q <<'EOSQL'
  -- Parking
  DELETE FROM dm3_parking.parking_sessions;
  DELETE FROM dm3_parking.parking_passes;
  DELETE FROM dm3_parking.parking_fee_rules;
  DELETE FROM dm3_parking.parking_vehicles;
  DELETE FROM dm3_parking.parking_zones;
  DELETE FROM dm3_parking.parking_lots;
  DELETE FROM dm3_parking.parking_settings;
  -- Visitor (recurring_visit_templates before visitors due to FK)
  DELETE FROM dm3_visitor.visitor_access_log;
  DELETE FROM dm3_visitor.visitor_agreement_signatures;
  DELETE FROM dm3_visitor.visitor_badges;
  DELETE FROM dm3_visitor.temp_credentials;
  DELETE FROM dm3_visitor.visits;
  DELETE FROM dm3_visitor.recurring_visit_templates;
  DELETE FROM dm3_visitor.visitors;
  DELETE FROM dm3_visitor.visit_groups;
  DELETE FROM dm3_visitor.watchlist;
  DELETE FROM dm3_visitor.visitor_agreements;
  DELETE FROM dm3_visitor.visitor_settings;
  -- Access
  DELETE FROM dm3_access.access_events;
  DELETE FROM dm3_access.access_group_access_points;
  DELETE FROM dm3_access.access_group_users;
  DELETE FROM dm3_access.access_groups;
  DELETE FROM dm3_access.access_time_slots;
  DELETE FROM dm3_access.access_times;
  DELETE FROM dm3_access.access_point_devices;
  DELETE FROM dm3_access.access_points;
  DELETE FROM dm3_access.zones;
  -- Identity
  DELETE FROM dm3_identity.user_group_members;
  DELETE FROM dm3_identity.user_groups;
  DELETE FROM dm3_identity.credentials;
  DELETE FROM dm3_identity.users;
  DELETE FROM dm3_identity.departments;
  -- Auth (keep sysadmin)
  DELETE FROM dm3_auth.accounts WHERE role != 'system_admin';
  DELETE FROM dm3_auth.tenants;
EOSQL
ok "Old data cleaned"

# Ensure sysadmin account exists
docker exec dm3-local-timescaledb psql -U dm3 -d dm3 -q -c "
  INSERT INTO dm3_auth.accounts (email, password_hash, full_name, role, status, locale, preferred_language)
  VALUES ('$SYSADMIN_EMAIL', '$BCRYPT_HASH', 'System Admin', 'system_admin', 'active', 'en', 'en')
  ON CONFLICT DO NOTHING;
  UPDATE dm3_auth.accounts SET password_hash = '$BCRYPT_HASH' WHERE email = '$SYSADMIN_EMAIL';
" 2>/dev/null
ok "System admin bootstrapped"

# ============================================================
# 1. LOGIN as system admin
# ============================================================
echo ""
echo "Phase 1: Authentication..."
SYSADMIN_TOKEN=$(do_login "$SYSADMIN_EMAIL" "$SYSADMIN_PASS")
[[ -z "$SYSADMIN_TOKEN" ]] && fail "Could not login as system admin"
ok "System admin logged in"

# ============================================================
# 2. CREATE TENANT (company) + enable plugins
# ============================================================
echo ""
echo "Phase 2: Tenant setup..."
TENANT_RESP=$(api_post "/api/v1/auth/system/companies" '{
  "name": "Duali Vietnam Demo",
  "code": "DUALI",
  "plan": "enterprise",
  "email": "admin@duali.com",
  "phone": "+84283456789",
  "address": "Ho Chi Minh City, Vietnam",
  "max_devices": 100,
  "max_users": 50
}' "$SYSADMIN_TOKEN")
TENANT_ID=$(echo "$TENANT_RESP" | jq -r '.company.id // empty')
if [[ -z "$TENANT_ID" ]]; then
  # Tenant may already exist — fetch it
  TENANT_ID=$(api_get "/api/v1/auth/system/companies" "$SYSADMIN_TOKEN" | jq -r '.data[] | select(.code=="DUALI") | .id')
fi
[[ -z "$TENANT_ID" ]] && fail "Could not create or find tenant"
ok "Tenant: $TENANT_ID"

# Enable all plugins
api_put "/api/v1/auth/system/companies/$TENANT_ID/plugins" '{"enabled_plugins": ["core","visitor","parking"]}' "$SYSADMIN_TOKEN" > /dev/null
ok "Plugins enabled: core, visitor, parking"

# ============================================================
# 3. CREATE ACCOUNTS (admin@duali.com auto-created by CreateCompany)
# ============================================================
echo ""
echo "Phase 3: User accounts..."
# admin@duali.com was auto-created by CreateCompany — only create the others
for acct in \
  "$MANAGER_EMAIL|Tran Manager|manager" \
  "$OPERATOR_EMAIL|Le Operator|operator" \
  "$VIEWER_EMAIL|Pham Viewer|viewer"; do
  IFS='|' read -r email name role <<< "$acct"
  api_post "/api/v1/auth/system/accounts" "{
    \"email\": \"$email\",
    \"name\": \"$name\",
    \"role\": \"$role\",
    \"tenant_id\": \"$TENANT_ID\"
  }" "$SYSADMIN_TOKEN" > /dev/null 2>&1
  ok "Account: $email ($role)"
done

# Set all account passwords to admin123 (API generates random passwords)
docker exec dm3-local-timescaledb psql -U dm3 -d dm3 -q -c "
  UPDATE dm3_auth.accounts SET password_hash = '$BCRYPT_HASH'
  WHERE email IN ('$ADMIN_EMAIL','$MANAGER_EMAIL','$OPERATOR_EMAIL','$VIEWER_EMAIL');
" 2>/dev/null
ok "All passwords set to: admin123"

# ============================================================
# 4. LOGIN as tenant admin
# ============================================================
echo ""
echo "Phase 4: Tenant admin login..."
ADMIN_TOKEN=$(do_login "$ADMIN_EMAIL" "$ADMIN_PASS" "$TENANT_ID")
[[ -z "$ADMIN_TOKEN" ]] && fail "Could not login as tenant admin"
ok "Tenant admin logged in"

# ============================================================
# 5. IDENTITY — Users (employees)
# ============================================================
echo ""
echo "Phase 5: Identity — Users & Credentials..."
declare -a USER_IDS=()
USER_DATA=(
  'Pham|Minh Duc|duc.pham@duali.com|+84901234004|EMP004|Senior Engineer'
  'Hoang|Thi Em|em.hoang@duali.com|+84901234005|EMP005|Receptionist'
  'Vo|Van Phuc|phuc.vo@duali.com|+84901234006|EMP006|Junior Engineer'
  'Dang|Quang Gia|gia.dang@duali.com|+84901234007|EMP007|Security Guard'
  'Bui|Thi Huong|huong.bui@duali.com|+84901234008|EMP008|Accountant'
  'Do|Minh Ich|ich.do@duali.com|+84901234009|EMP009|Sales Executive'
  'Ngo|Van Khanh|khanh.ngo@duali.com|+84901234010|EMP010|IT Admin'
)

for u in "${USER_DATA[@]}"; do
  IFS='|' read -r first last email phone emp pos <<< "$u"
  resp=$(api_post "/api/v1/identity/users" "{
    \"first_name\": \"$first\",
    \"last_name\": \"$last\",
    \"email\": \"$email\",
    \"phone\": \"$phone\",
    \"emp_number\": \"$emp\",
    \"position\": \"$pos\"
  }" "$ADMIN_TOKEN")
  uid=$(echo "$resp" | jq -r '.id // empty')
  USER_IDS+=("$uid")
  ok "User: $first $last ($emp)"
done

# Credentials for first 5 users
ALL_USERS_RESP=$(api_get "/api/v1/identity/users?limit=20" "$ADMIN_TOKEN")
ALL_USER_IDS=$(echo "$ALL_USERS_RESP" | jq -r '.users[].id')
CARD_NUM=1
for uid in $ALL_USER_IDS; do
  CARD_VAL=$(printf "CARD%06d" $CARD_NUM)
  PIN_VAL=$(printf "%04d" $((1000 + CARD_NUM)))
  api_post "/api/v1/identity/users/$uid/credentials" "{\"type\":\"card\",\"value\":\"$CARD_VAL\"}" "$ADMIN_TOKEN" > /dev/null 2>&1
  api_post "/api/v1/identity/users/$uid/credentials" "{\"type\":\"pin\",\"value\":\"$PIN_VAL\"}" "$ADMIN_TOKEN" > /dev/null 2>&1
  CARD_NUM=$((CARD_NUM + 1))
done
ok "Credentials: cards + PINs assigned"

# User Groups
for grp in \
  "Engineering Team|All engineering department members" \
  "Management|Department managers and above" \
  "Security Staff|Security team members"; do
  IFS='|' read -r gname gdesc <<< "$grp"
  api_post "/api/v1/identity/groups" "{\"name\":\"$gname\",\"description\":\"$gdesc\"}" "$ADMIN_TOKEN" > /dev/null 2>&1
  ok "Group: $gname"
done

# Identity Vehicles: REMOVED — vehicles now managed by parking-svc

# ============================================================
# 6. ACCESS — Zones, Times, Groups, Points
# ============================================================
echo ""
echo "Phase 6: Access Control setup..."

# Zones
ZONE_IDS=()
for z in \
  'Main Building|Primary office building|Building A|' \
  'Main Lobby|Ground floor lobby and reception|Building A|1F' \
  'Engineering Floor|Engineering workspace|Building A|2F' \
  'Server Room|Restricted server room|Building A|3F' \
  'Warehouse|Storage and logistics|Warehouse|1F' \
  'Parking B1|Underground parking level B1|Building A|B1'; do
  IFS='|' read -r zname zdesc zbldg zfloor <<< "$z"
  payload="{\"name\":\"$zname\",\"description\":\"$zdesc\",\"building\":\"$zbldg\""
  [[ -n "$zfloor" ]] && payload="$payload,\"floor\":\"$zfloor\""
  payload="$payload}"
  resp=$(api_post "/api/v1/access/zones" "$payload" "$ADMIN_TOKEN")
  zid=$(echo "$resp" | jq -r '.id // empty')
  ZONE_IDS+=("$zid")
  ok "Zone: $zname"
done

# Access Times
AT_IDS=()
for at_item in \
  'Business Hours|Monday to Friday 08:00-18:00' \
  '24/7 Access|Unrestricted all-day access' \
  'Extended Hours|Monday to Saturday 06:00-22:00'; do
  IFS='|' read -r atname atdesc <<< "$at_item"
  resp=$(api_post "/api/v1/access/access-times" "{
    \"name\": \"$atname\",
    \"description\": \"$atdesc\",
    \"slots\": []
  }" "$ADMIN_TOKEN")
  atid=$(echo "$resp" | jq -r '.id // empty')
  AT_IDS+=("$atid")
  ok "Access Time: $atname"
done

# Access Groups
AG_IDS=()
for ag_item in \
  "General Staff|Default access for all employees|true|0" \
  "Security Team|24/7 full building access|false|1" \
  "Server Room Access|Restricted server room access|false|0" \
  "Visitor Access|Limited access for visitors|false|0"; do
  IFS='|' read -r agname agdesc agdefault agtime_idx <<< "$ag_item"
  at_id="${AT_IDS[$agtime_idx]:-}"
  payload="{\"name\":\"$agname\",\"description\":\"$agdesc\",\"is_default\":$agdefault"
  [[ -n "$at_id" ]] && payload="$payload,\"access_time_id\":\"$at_id\""
  payload="$payload}"
  resp=$(api_post "/api/v1/access/access-groups" "$payload" "$ADMIN_TOKEN")
  agid=$(echo "$resp" | jq -r '.id // empty')
  AG_IDS+=("$agid")
  ok "Access Group: $agname"
done

# Access Points
AP_IDS=()
for ap_item in \
  "Main Entrance|Primary entrance with terminal|1|0" \
  "Side Door|Staff side entrance|1|0" \
  "Parking Gate B1|Underground parking gate|5|1" \
  "Server Room Door|Restricted access|3|0" \
  "Warehouse Entry|Warehouse main door|4|2"; do
  IFS='|' read -r apname apdesc zone_idx time_idx <<< "$ap_item"
  z_id="${ZONE_IDS[$zone_idx]:-}"
  a_id="${AT_IDS[$time_idx]:-}"
  payload="{\"name\":\"$apname\",\"description\":\"$apdesc\""
  [[ -n "$z_id" ]] && payload="$payload,\"zone_id\":\"$z_id\""
  [[ -n "$a_id" ]] && payload="$payload,\"access_time_id\":\"$a_id\""
  payload="$payload}"
  resp=$(api_post "/api/v1/access/access-points" "$payload" "$ADMIN_TOKEN")
  apid=$(echo "$resp" | jq -r '.id // empty')
  AP_IDS+=("$apid")
  ok "Access Point: $apname"
done

# ============================================================
# 7. VISITOR — Settings, Visitors, Visits, Watchlist, Agreements
# ============================================================
echo ""
echo "Phase 7: Visitor Management..."

# Settings
api_put "/api/v1/visitors/settings" '{
  "approval_required": true,
  "auto_approve_returning": false,
  "auto_approve_vip": true,
  "default_duration_hours": 8,
  "max_duration_hours": 24,
  "auto_checkout_hour": 22,
  "require_phone": true,
  "badge_enabled": true,
  "notify_host_on_arrival": true
}' "$ADMIN_TOKEN" > /dev/null 2>&1
ok "Visitor settings configured"

# Agreements
for agr in \
  'Standard NDA|By signing this agreement, the visitor agrees to maintain confidentiality of all proprietary information observed during the visit.|meeting,interview,tour' \
  'Safety Waiver|The visitor acknowledges they have been informed of safety protocols and agrees to follow all posted safety guidelines.|maintenance,delivery'; do
  IFS='|' read -r agrname agrcontent agrfor <<< "$agr"
  api_post "/api/v1/visitors/agreements" "{
    \"name\": \"$agrname\",
    \"content\": \"$agrcontent\",
    \"required_for\": [$(echo "$agrfor" | sed 's/,/","/g; s/^/"/; s/$/"/' )]
  }" "$ADMIN_TOKEN" > /dev/null 2>&1
  ok "Agreement: $agrname"
done

# Fetch host user IDs (first 3 identity users with accounts)
HOST_IDS=$(echo "$ALL_USERS_RESP" | jq -r '[.users[].id] | .[0:3] | .[]')
HOST1=$(echo "$HOST_IDS" | sed -n '1p')
HOST2=$(echo "$HOST_IDS" | sed -n '2p')
HOST3=$(echo "$HOST_IDS" | sed -n '3p')
[[ -z "$HOST1" ]] && HOST1="$HOST2"

# Create visits (pre-registered)
VISIT_IDS=()
for visit in \
  "John|Smith|john.smith@acme.com|+1555000001|ACME Corp|meeting|Q2 project review|$HOST1" \
  "Maria|Garcia|maria.garcia@techco.com|+1555000002|TechCo|interview|Software Engineer position|$HOST2" \
  "Tanaka|Yuki|yuki.tanaka@jppartner.co.jp|+81901234567|JP Partners|meeting|Partnership contract signing|$HOST1" \
  "Kim|Soo-jin|soojin@krtech.kr|+82101234567|KR Tech|meeting|Follow-up technical review|$HOST3" \
  "Robert|Johnson|rjohnson@globalinc.com|+1555000005|Global Inc|maintenance|AC unit maintenance|$HOST1" \
  "Sarah|Williams|sarah.w@partnerfirm.com|+1555000007|Partner Firm LLC|meeting|VIP partner quarterly review|$HOST1" \
  "Chen|Wei|chen.wei@shenzhentech.cn|+8613800138001|Shenzhen Tech|delivery|Equipment delivery|$HOST2"; do
  IFS='|' read -r vfirst vlast vemail vphone vcompany vpurpose vnote vhost <<< "$visit"
  resp=$(api_post "/api/v1/visitors/" "{
    \"visitor\": {
      \"first_name\": \"$vfirst\",
      \"last_name\": \"$vlast\",
      \"email\": \"$vemail\",
      \"phone\": \"$vphone\",
      \"company\": \"$vcompany\"
    },
    \"host_user_id\": \"$vhost\",
    \"purpose\": \"$vpurpose\",
    \"purpose_note\": \"$vnote\",
    \"expected_arrival\": \"$(date -u -v+2H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)\",
    \"expected_departure\": \"$(date -u -v+6H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+6 hours' +%Y-%m-%dT%H:%M:%SZ)\"
  }" "$ADMIN_TOKEN")
  vid=$(echo "$resp" | jq -r '.id // empty')
  VISIT_IDS+=("$vid")
  ok "Visit: $vfirst $vlast ($vpurpose)"
done

# Approve first 3 visits
for i in 0 1 2; do
  vid="${VISIT_IDS[$i]:-}"
  [[ -z "$vid" || "$vid" == "null" ]] && continue
  api_post "/api/v1/visitors/$vid/approve" '{}' "$ADMIN_TOKEN" > /dev/null 2>&1
done
ok "Approved 3 visits"

# Check in visit #3 (Tanaka)
vid="${VISIT_IDS[2]:-}"
if [[ -n "$vid" && "$vid" != "null" ]]; then
  api_post "/api/v1/visitors/$vid/checkin" '{"method":"terminal_qr","badge_number":"V-001"}' "$ADMIN_TOKEN" > /dev/null 2>&1
  ok "Checked in: Tanaka Yuki (badge V-001)"
fi

# Watchlist
for wl in \
  'David Blackwell|name|David Blackwell|Previous security incident' \
  'Banned email|email|banned@suspicious.com|Fraudulent identity documents' \
  'National ID match|national_id|999888777|Linked to watchlist entry'; do
  IFS='|' read -r wlname wlfield wlvalue wlreason <<< "$wl"
  api_post "/api/v1/visitors/watchlist" "{
    \"entry_type\": \"blacklisted\",
    \"match_field\": \"$wlfield\",
    \"match_value\": \"$wlvalue\",
    \"reason\": \"$wlreason\"
  }" "$ADMIN_TOKEN" > /dev/null 2>&1
  ok "Watchlist: $wlname"
done

# Recurring templates
api_post "/api/v1/visitors/recurring" "{
  \"visitor_id\": \"$(echo "$resp" | jq -r '.visitor_id // empty')\",
  \"host_user_id\": \"$HOST1\",
  \"purpose\": \"meeting\",
  \"recurrence_rule\": \"FREQ=WEEKLY;BYDAY=TU,TH\",
  \"start_date\": \"$(date +%Y-%m-%d)\",
  \"end_date\": \"$(date -v+90d +%Y-%m-%d 2>/dev/null || date -d '+90 days' +%Y-%m-%d)\"
}" "$ADMIN_TOKEN" > /dev/null 2>&1
ok "Recurring template: weekly Tue/Thu"

# ============================================================
# 8. PARKING — Lots, Zones, Vehicles, Fee Rules, Passes, Sessions
# ============================================================
echo ""
echo "Phase 8: Parking Management..."

# Lots
LOT_IDS=()
for lot in \
  'Main Building Parking|MAIN-PKG|Underground parking beneath main office building' \
  'Annex Surface Lot|ANNEX-PKG|Open-air parking lot near annex building'; do
  IFS='|' read -r lname lcode ldesc <<< "$lot"
  resp=$(api_post "/api/v1/parking/lots" "{
    \"name\": \"$lname\",
    \"code\": \"$lcode\",
    \"description\": \"$ldesc\"
  }" "$ADMIN_TOKEN")
  lid=$(echo "$resp" | jq -r '.id // empty')
  LOT_IDS+=("$lid")
  ok "Lot: $lname ($lcode)"
done

# Zones
PZONE_IDS=()
for pz in \
  'B1 Car Park|B1-CAR|underground|B1|80|0|["car"]' \
  'B2 Motorbike Park|B2-MOTO|underground|B2|200|0|["motorbike","bicycle"]' \
  'Surface Car Lot|SURF-CAR|surface||40|1|["car","truck"]' \
  'Rooftop Motorbike|ROOF-MOTO|rooftop||100|1|["motorbike","bicycle"]'; do
  IFS='|' read -r pzname pzcode pztype pzlevel pzspaces lot_idx pzvtypes <<< "$pz"
  lot_id="${LOT_IDS[$lot_idx]:-}"
  payload="{\"name\":\"$pzname\",\"code\":\"$pzcode\",\"type\":\"$pztype\",\"total_spaces\":$pzspaces,\"lot_id\":\"$lot_id\",\"vehicle_types\":$pzvtypes"
  [[ -n "$pzlevel" ]] && payload="$payload,\"level\":\"$pzlevel\""
  payload="$payload}"
  resp=$(api_post "/api/v1/parking/zones" "$payload" "$ADMIN_TOKEN")
  pzid=$(echo "$resp" | jq -r '.id // empty')
  PZONE_IDS+=("$pzid")
  ok "Zone: $pzname ($pzcode)"
done

# Fee Rules
for fr in \
  'Hourly Car Rate|car|hourly|{"first_hour":20000,"additional_hour":10000,"currency":"VND"}|15|120000|visitor|10' \
  'Hourly Motorbike Rate|motorbike|hourly|{"first_hour":5000,"additional_hour":3000,"currency":"VND"}|15|30000|visitor|10' \
  'Flat Visitor Car|car|flat|{"amount":30000,"currency":"VND"}|0||visitor|5' \
  'Daily Truck Rate|truck|daily|{"amount":100000,"currency":"VND"}|30|100000|all|10'; do
  IFS='|' read -r frname frvtype frrate frrates frfree frmax frapplies frpri <<< "$fr"
  payload="{\"name\":\"$frname\",\"vehicle_type\":\"$frvtype\",\"rate_type\":\"$frrate\",\"rates\":$frrates,\"free_minutes\":$frfree,\"applies_to\":\"$frapplies\",\"priority\":$frpri,\"enabled\":true"
  [[ -n "$frmax" ]] && payload="$payload,\"max_daily\":$frmax"
  payload="$payload}"
  api_post "/api/v1/parking/fee-rules" "$payload" "$ADMIN_TOKEN" > /dev/null 2>&1
  ok "Fee Rule: $frname"
done

# Vehicles
PVEH_IDS=()
for pv in \
  '51A-123.45|car|resident|Toyota|White' \
  '59C1-456.78|motorbike|resident|Honda|Black' \
  '30H-789.01|car|resident|Hyundai|Silver' \
  '51F-222.33|car|visitor||Red' \
  '59B2-333.44|motorbike|temporary||' \
  '51G-555.66|car|visitor|BMW|Black' \
  '30K-888.99|car|resident|Mercedes|White' \
  '59D1-111.22|motorbike|resident|Yamaha|Blue' \
  '51H-444.55|truck|temporary||White' \
  '29A-777.88|car|visitor|Kia|Gray'; do
  IFS='|' read -r pvplate pvtype pvcat pvbrand pvcolor <<< "$pv"
  payload="{\"plate_number\":\"$pvplate\",\"type\":\"$pvtype\",\"category\":\"$pvcat\""
  [[ -n "$pvbrand" ]] && payload="$payload,\"brand\":\"$pvbrand\""
  [[ -n "$pvcolor" ]] && payload="$payload,\"color\":\"$pvcolor\""
  payload="$payload}"
  resp=$(api_post "/api/v1/parking/vehicles" "$payload" "$ADMIN_TOKEN")
  pvid=$(echo "$resp" | jq -r '.id // empty')
  PVEH_IDS+=("$pvid")
  ok "Vehicle: $pvplate ($pvtype)"
done

# Passes (monthly)
PASS_IDS=()
valid_from=$(date -v-15d +%Y-%m-%d 2>/dev/null || date -d '-15 days' +%Y-%m-%d)
valid_until=$(date -v+15d +%Y-%m-%d 2>/dev/null || date -d '+15 days' +%Y-%m-%d)
for pp in \
  "0|0|1500000|active|true" \
  "1|1|300000|active|true" \
  "0|2|1500000|active|false" \
  "0|6|1500000|active|true"; do
  IFS='|' read -r pzone_idx pveh_idx ppfee ppstatus pprenew <<< "$pp"
  pzone_id="${PZONE_IDS[$pzone_idx]:-}"
  pveh_id="${PVEH_IDS[$pveh_idx]:-}"
  [[ -z "$pzone_id" || -z "$pveh_id" ]] && continue
  resp=$(api_post "/api/v1/parking/passes" "{
    \"zone_id\": \"$pzone_id\",
    \"vehicle_id\": \"$pveh_id\",
    \"pass_type\": \"standard\",
    \"valid_from\": \"$valid_from\",
    \"valid_until\": \"$valid_until\",
    \"fee_amount\": $ppfee,
    \"auto_renew\": $pprenew
  }" "$ADMIN_TOKEN")
  passid=$(echo "$resp" | jq -r '.id // empty')
  PASS_IDS+=("$passid")
  ok "Pass: zone[$pzone_idx] vehicle[$pveh_idx] ($ppfee VND)"
done

# Sessions (active)
for ps in \
  "0|0|0|51A-123.45|car" \
  "1|2|3|51F-222.33|car" \
  "0|1|1|59C1-456.78|motorbike" \
  "0|0|6|30K-888.99|car"; do
  IFS='|' read -r plot_idx pzone_idx pveh_idx psplate psvtype <<< "$ps"
  plot_id="${LOT_IDS[$plot_idx]:-}"
  pzone_id="${PZONE_IDS[$pzone_idx]:-}"
  pveh_id="${PVEH_IDS[$pveh_idx]:-}"
  [[ -z "$plot_id" || -z "$pzone_id" ]] && continue
  payload="{\"lot_id\":\"$plot_id\",\"zone_id\":\"$pzone_id\",\"plate_number\":\"$psplate\",\"vehicle_type\":\"$psvtype\""
  [[ -n "$pveh_id" && "$pveh_id" != "null" ]] && payload="$payload,\"vehicle_id\":\"$pveh_id\""
  payload="$payload}"
  api_post "/api/v1/parking/sessions" "$payload" "$ADMIN_TOKEN" > /dev/null 2>&1
  ok "Session: $psplate ($psvtype, active)"
done

# Settings
api_put "/api/v1/parking/settings" '{
  "auto_open_barrier_on_pass": true,
  "confidence_threshold": 0.85,
  "require_payment_before_exit": true,
  "free_minutes_global": 15,
  "max_session_hours": 24,
  "allow_unregistered_entry": true,
  "plate_recognition_enabled": true,
  "default_fee_currency": "VND",
  "notify_on_disputed": true,
  "capacity_alert_threshold": 80
}' "$ADMIN_TOKEN" > /dev/null 2>&1
ok "Parking settings configured"

# ============================================================
# DONE
# ============================================================
echo ""
echo "============================================"
echo -e " ${GREEN}Seed complete!${NC}"
echo "============================================"
echo ""
echo "Accounts (password: admin123):"
echo "  sysadmin@duali.com  (system_admin)"
echo "  admin@duali.com     (primary_manager)"
echo "  manager@duali.com   (manager)"
echo "  operator@duali.com  (operator)"
echo "  viewer@duali.com    (viewer)"
echo ""
echo "Modules seeded: Identity, Access, Visitor, Parking"
