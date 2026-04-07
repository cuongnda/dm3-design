# Feature: Device Provisioning — Bootstrap & QR Flows

> Domain: PLATFORM | Color: #6B7280 | Priority: P0
> Status: **Implementing** | Owner: Platform Team
> Created: 2026-02-19

## Overview

Device provisioning is how new devices join the Duall Master platform. Two flows are supported:

1. **QR Flow** — Admin pre-creates device, generates QR code. Technician scans QR on device. Instant activation, no approval needed.
2. **Bootstrap Flow** — Device self-registers using shared bootstrap credentials. Admin reviews and approves. For 3rd party devices or when pre-registration isn't possible.

Both flows result in the same end state: device is registered, assigned to a company, and has a unique JWT for MQTT authentication.

---

## Device Lifecycle

```
[QR Flow]
  Admin creates device → status: provisioning → QR generated
    → Technician scans QR on device → device connects with one-time token
    → Server validates token → provisions device → status: online

[Bootstrap Flow]  
  Technician enters RID + server on device → device connects with bootstrap creds
    → Server creates pending record → status: pending_approval
    → Admin reviews + assigns company → approves → status: provisioning
    → Server sends credentials to device → device reconnects → status: online

[Common lifecycle after provisioning]
  online → active (first heartbeat after config sync)
  active → offline (missed 3 heartbeats)
  active → disabled (admin action)
  active → decommissioned (removed from company)
```

---

## Flow 1: QR Provisioning (Pre-Authorized)

### Step 1: Admin Creates Device

**API:** `POST /api/v1/devices/provision`
**Auth:** Bearer token, role = system_admin OR primary_manager

**Request:**
```json
{
  "device_id": "000001",
  "name": "Lobby A — Gate 1",
  "type": "terminal",
  "company_id": "uuid-of-company",
  "site_id": "uuid-of-site",
  "location": "Building A, Floor 1, Main Entrance"
}
```

**Response 201:**
```json
{
  "device": {
    "id": "uuid",
    "device_id": "000001",
    "name": "Lobby A — Gate 1",
    "type": "terminal",
    "status": "provisioning",
    "company_id": "uuid"
  },
  "provisioning": {
    "qr_token": "dm3_qr_v1.eyJhbGci...",
    "qr_data": "https://dm3.duali.vn/activate?t=dm3_qr_v1.eyJhbGci...",
    "expires_at": "2026-02-19T22:09:00Z",
    "ttl_minutes": 30
  }
}
```

**QR Token structure (JWT, 30min TTL):**
```json
{
  "purpose": "device_activation",
  "did": "000001",
  "cid": "company-uuid",
  "dtype": "terminal",
  "mqtt_broker": "mqtt.duallmaster.com:8883",
  "iat": 1771509000,
  "exp": 1771510800
}
```

### Step 2: Technician Scans QR on Device

Device scans QR code using camera → extracts QR token.

**Or manual entry:** Technician can also enter the token string in device Settings (for devices without camera).

### Step 3: Device Activates

**API:** `POST /api/v1/devices/activate`  
**Auth:** None (the QR token IS the auth)

**Request:**
```json
{
  "qr_token": "dm3_qr_v1.eyJhbGci...",
  "hardware_fingerprint": {
    "android_id": "abc123def456",
    "mac_address": "AA:BB:CC:DD:EE:FF",
    "model": "DF-970",
    "firmware_version": "1.2.0",
    "app_signature_hash": "sha256:a1b2c3..."
  }
}
```

**Response 200:**
```json
{
  "status": "activated",
  "device_id": "000001",
  "company": {
    "id": "uuid",
    "name": "ACME Corp",
    "code": "acme"
  },
  "mqtt": {
    "broker": "mqtt.duallmaster.com:8883",
    "username": "device:000001",
    "token": "eyJhbG...",
    "token_expires_at": "2026-02-20T21:09:00Z",
    "refresh_url": "https://dm3.duali.vn/api/v1/devices/refresh-token"
  },
  "config": {
    "heartbeat_interval_sec": 30,
    "sync_url": "https://dm3.duali.vn/api/v1",
    "tenant_id": "company-uuid"
  }
}
```

**Server side effects:**
1. Validates QR token (signature, not expired, not already used)
2. Marks QR token as used (single-use, burned)
3. Stores hardware fingerprint on device record
4. Generates device MQTT JWT (24h)
5. Updates device status → `online`

### Step 4: Device Connects to MQTT

Device stores credentials in Android Keystore, connects to EMQX with JWT.

---

## Flow 2: Bootstrap Provisioning (Self-Registration)

### Bootstrap Security

Every Duali firmware/app embeds a **bootstrap secret** (compiled into the binary, not user-visible):
```
BOOTSTRAP_SECRET = "dm3-bootstrap-v1-{random-64-char-hex}"
```

This secret is used to generate HMAC signatures proving the device runs Duali firmware.

### Step 1: Technician Configures Device

On device Settings screen:
- **RID:** 000001 (6-digit device ID)
- **Server:** mqtt.duallmaster.com (pre-filled from firmware defaults)

Device auto-generates bootstrap credentials:
```
username: "bootstrap:000001"
password: HMAC-SHA256("000001:" + timestamp_minute, BOOTSTRAP_SECRET)
```

The timestamp is rounded to the current minute, giving a 60-second validity window. Server checks current minute ± 1 to handle clock drift.

### Step 2: Device Connects & Registers

Device connects to EMQX with bootstrap credentials.

**EMQX ACL for bootstrap users:**
- Can ONLY publish to: `dm/bootstrap/register`
- Can ONLY subscribe to: `dm/bootstrap/{RID}/response`
- Connection auto-expires after 10 minutes

**Device publishes registration request:**

Topic: `dm/bootstrap/register`
```json
{
  "type": "device.register",
  "rid": "000001",
  "device_type": "terminal",
  "firmware_version": "1.2.0",
  "hardware_fingerprint": {
    "android_id": "abc123def456",
    "mac_address": "AA:BB:CC:DD:EE:FF",
    "model": "DF-970",
    "cpu_serial": "...",
    "app_signature_hash": "sha256:a1b2c3..."
  },
  "hmac": "sha256-hmac-of-payload",
  "timestamp": 1771509000,
  "nonce": "random-uuid"
}
```

### Step 3: Server Validates & Creates Pending Record

Server (device-gateway) receives registration:

1. **Validate HMAC** — recompute HMAC over payload using BOOTSTRAP_SECRET. Must match.
2. **Validate app_signature_hash** — must match known Duali APK signing key hash.
3. **Check RID availability** — not already registered.
4. **Check nonce** — not a replay (store nonces for 10 min).
5. **Create pending device record** — status = `pending_approval`

**Publish acknowledgment:**

Topic: `dm/bootstrap/{RID}/response`
```json
{
  "type": "device.register_ack",
  "rid": "000001",
  "status": "pending_approval",
  "message": "Registration received. Awaiting admin approval."
}
```

Device shows on screen: "⏳ Waiting for approval..."

### Step 4: Admin Approves

System Admin or Company Manager sees pending device in UI:

```
┌─────────────────────────────────────────────────────────┐
│ 🔔 Pending Device Registrations                         │
│                                                         │
│ RID: 000001 │ Type: DF-970 │ Firmware: 1.2.0           │
│ Hardware: Android ID abc123, MAC AA:BB:CC:DD:EE:FF      │
│ App Signature: ✅ Verified (matches Duali signing key)   │
│ Requested: 3 minutes ago                                │
│                                                         │
│ Assign to: [Select Company ▼]                           │
│ Site:      [Select Site ▼]                              │
│ Name:      [Lobby A — Gate 1          ]                 │
│                                                         │
│ [✅ Approve]  [❌ Reject]                                │
└─────────────────────────────────────────────────────────┘
```

**API:** `POST /api/v1/devices/pending/{id}/approve`
**Auth:** Bearer token, system_admin or primary_manager

**Request:**
```json
{
  "company_id": "uuid",
  "site_id": "uuid",
  "name": "Lobby A — Gate 1",
  "location": "Building A, Floor 1"
}
```

### Step 5: Server Sends Credentials

Server generates device JWT, publishes to bootstrap channel:

Topic: `dm/bootstrap/{RID}/response`
```json
{
  "type": "device.approved",
  "rid": "000001",
  "status": "approved",
  "credentials": {
    "mqtt_username": "device:000001",
    "mqtt_token": "eyJhbG...",
    "token_expires_at": "2026-02-20T21:39:00Z",
    "refresh_url": "https://dm3.duali.vn/api/v1/devices/refresh-token"
  },
  "company": {
    "id": "uuid",
    "name": "ACME Corp"
  },
  "config": {
    "heartbeat_interval_sec": 30,
    "sync_url": "https://dm3.duali.vn/api/v1",
    "tenant_id": "company-uuid"
  }
}
```

### Step 6: Device Reconnects

Device:
1. Receives approval message
2. Stores credentials in secure storage (Android Keystore)
3. Disconnects from bootstrap
4. Reconnects with device JWT
5. Status → `online`, begins normal operation

---

## MQTT JWT (Device Token)

**Claims:**
```json
{
  "sub": "device:000001",
  "cid": "company-uuid",
  "did": "000001",
  "dtype": "terminal",
  "permissions": [
    "pub:dm/{cid}/device/{did}/evt",
    "pub:dm/{cid}/device/{did}/sta",
    "pub:dm/{cid}/device/{did}/cmd/resp",
    "pub:dm/{cid}/device/{did}/cfg/ack",
    "sub:dm/{cid}/device/{did}/cmd",
    "sub:dm/{cid}/device/{did}/cfg",
    "sub:dm/{cid}/emergency/#"
  ],
  "iat": 1771509000,
  "exp": 1771595400
}
```

**Token refresh:** Device calls HTTPS endpoint 1 hour before expiry:
```
POST /api/v1/devices/refresh-token
Authorization: Bearer {current-device-jwt}
→ Returns new JWT
```

---

## EMQX ACL Configuration

### Bootstrap Users
```
username: "bootstrap:*"
  allow publish: dm/bootstrap/register
  allow subscribe: dm/bootstrap/{RID}/response
  deny all other
  max_connection_time: 600s
```

### Authenticated Devices
```
username: "device:*"
  JWT claim matching:
    allow publish: dm/{cid}/device/{did}/evt
    allow publish: dm/{cid}/device/{did}/sta
    allow publish: dm/{cid}/device/{did}/cmd/resp
    allow publish: dm/{cid}/device/{did}/cfg/ack
    allow subscribe: dm/{cid}/device/{did}/cmd
    allow subscribe: dm/{cid}/device/{did}/cfg
    allow subscribe: dm/{cid}/emergency/#
    deny all other
```

---

## API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/devices/provision` | Bearer (admin/manager) | Pre-create device + generate QR |
| GET | `/api/v1/devices/provision/{id}/qr` | Bearer | Regenerate QR (if expired) |
| POST | `/api/v1/devices/activate` | QR token | Device activates via QR token |
| GET | `/api/v1/devices/pending` | Bearer (admin/manager) | List pending registrations |
| POST | `/api/v1/devices/pending/{id}/approve` | Bearer (admin/manager) | Approve + assign to company |
| POST | `/api/v1/devices/pending/{id}/reject` | Bearer (admin/manager) | Reject registration |
| POST | `/api/v1/devices/refresh-token` | Device JWT | Refresh device MQTT token |

---

## Security Summary

| Layer | QR Flow | Bootstrap Flow |
|-------|---------|----------------|
| **Initial auth** | One-time QR token (JWT, 30min, single-use) | HMAC with firmware-embedded secret |
| **Device verification** | Hardware fingerprint stored | HMAC + app_signature_hash verification |
| **Credential delivery** | HTTPS response (direct) | MQTT over TLS (bootstrap channel) |
| **Ongoing auth** | Device JWT (24h, auto-refresh) | Device JWT (24h, auto-refresh) |
| **MQTT isolation** | ACL from JWT claims | ACL from JWT claims |
| **Replay protection** | Token burned after use | Nonce + timestamp window |
| **Man-in-middle** | TLS required | TLS required |

---

## Token Lifecycle & Offline Resilience

### Device JWT Refresh

Device MQTT JWTs expire after 24 hours. Devices must refresh before expiry.

**Normal refresh (device online, token not yet expired):**
```
Device checks JWT expiry every 5 minutes
  → If < 1 hour remaining:
    POST /api/v1/devices/refresh-token
    Auth: Bearer {current-jwt}
    → Returns new 24h JWT
    → Device reconnects to MQTT with new token
```

**Expired token refresh (device was offline > 24h):**
```
Device boots up / reconnects after outage
  → JWT expired → MQTT connection rejected
  → Call refresh endpoint with expired JWT:
    POST /api/v1/devices/refresh-token
    Auth: Bearer {expired-jwt}
  → Server checks:
    - Is the device still active? (not decommissioned)
    - Is the token within grace period? (expired < 7 days ago)
    - Is the device_id valid and matches the JWT claims?
  → If all pass: returns new 24h JWT ✅
  → If grace period exceeded (> 7 days): returns 401 → device needs re-provisioning
  → If device decommissioned: returns 403 → device shows "Deactivated"
```

### Grace Period Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `DEVICE_TOKEN_TTL` | 24h | JWT validity period |
| `DEVICE_REFRESH_GRACE_DAYS` | 7 | Max days an expired token can still refresh |
| `DEVICE_REFRESH_BUFFER` | 1h | How early before expiry device should refresh |

### Offline Mode Behavior

When a device cannot reach the server (no network, server down):

```
1. Device operates in FULL OFFLINE MODE
   → Access decisions made locally from synced user DB + rules
   → This is by design (offline-first architecture)

2. Events queued locally
   → Access events stored in Room DB (SQLite)
   → Queue drains automatically when reconnected
   → Events include original timestamp (not upload time)

3. Reconnection strategy (exponential backoff)
   → Retry MQTT: 5s → 10s → 30s → 60s → 300s (5min max)
   → Retry HTTPS refresh: every 5 minutes
   → On successful refresh → reconnect MQTT → drain event queue

4. Device status on server
   → Missed 3 heartbeats (90s) → status: "offline"
   → Reconnects → status: "online" → heartbeats resume
```

### Edge Cases

| Scenario | Device Behavior | Server Behavior |
|----------|----------------|-----------------|
| Offline < 24h | Reconnects with same JWT | Updates last_seen, status → online |
| Offline 1-7 days | Refreshes expired JWT via HTTPS, then reconnects | Issues new JWT, logs reconnection |
| Offline > 7 days | Refresh rejected (401), shows "Re-activation needed" | Rejects refresh, requires re-provisioning |
| Server unreachable | Full offline mode, queues events, retries every 5min | Shows device as "offline" |
| Device decommissioned while offline | Refresh returns 403, shows "Deactivated" | Device record marked decommissioned |
| Network flap (brief disconnect) | Auto-reconnect with same JWT (< 24h) | Brief offline blip in status |
| Clock drift on device | Server allows ±5min tolerance on JWT timestamps | Logged as warning |

### Refresh Token Endpoint (Updated)

**`POST /api/v1/devices/refresh-token`**

**Auth:** Device JWT (valid OR expired within grace period)

**Server logic:**
```
1. Parse JWT (skip expiry validation)
2. Extract device_id, company_id from claims
3. Verify device exists and status != decommissioned
4. Check JWT issued_at:
   - If expired > DEVICE_REFRESH_GRACE_DAYS → 401 "Token expired beyond grace period"
   - If device decommissioned → 403 "Device deactivated"
5. Generate new 24h JWT
6. Update device.last_seen
7. Return new JWT
```

**Response 200:**
```json
{
  "token": "eyJhbG...",
  "expires_at": "2026-02-20T21:51:00Z"
}
```

**Response 401:** `{"error": "Token expired beyond grace period. Re-provisioning required."}`
**Response 403:** `{"error": "Device has been deactivated."}`

---

## Simulator Support

The device simulator should support both flows for testing:

```bash
# QR flow: simulate a device activating via QR token
curl -X POST http://localhost:9090/api/simulate/activate \
  -d '{"qr_token": "dm3_qr_v1.eyJ..."}'

# Bootstrap flow: simulate a device self-registering
curl -X POST http://localhost:9090/api/simulate/bootstrap \
  -d '{"rid": "000099", "device_type": "terminal"}'
```

---

## DF-970 Android Implementation

### QR Activation Screen
- New screen accessible from Settings: "Activate Device"
- Opens camera → scans QR code
- Shows "Activating..." → calls `/api/v1/devices/activate` via HTTPS
- On success: stores credentials, shows company name, returns to idle

### Bootstrap Registration
- Existing Settings → Device Config screen
- Enter RID + Server URL
- Tap "Register" → connects via bootstrap MQTT
- Shows "⏳ Waiting for approval..."
- On approval: auto-reconnects with new credentials

### Credential Storage
- Use Android Keystore for JWT storage
- Encrypted SharedPreferences as fallback
- Never log credentials
