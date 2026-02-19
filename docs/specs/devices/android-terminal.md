# Device Specification: Android-Based Access Control Terminal (DF-970)

> Domain: SECURE | Priority: P0
> Status: Draft | Owner: Device Team
> Device Type: Wall-Mount Android Terminal
> Hardware: Duali DF-970 (https://duali.com/en/product/reader/wall-mount-reader/df-970/)

---

## 1. Overview & Purpose

The DF-970 is a wall-mounted Android access control terminal with integrated face recognition camera and smart card reader. It serves as the primary user-facing device in the DM3 ecosystem — identifying people via face, card, or PIN and making access decisions **locally in < 50ms** using a synced person database and access rules.

**Key principle: Offline-first.** The terminal operates autonomously with its local database. Server connectivity adds sync and event upload — it is never required for access decisions.

**Capabilities:**
- Face recognition (IR camera + Megvii SDK, 1:N matching against local DB)
- Smart card reading (Mifare Classic, DESFire, FeliCa)
- PIN input (on-screen keypad)
- Multi-factor authentication (Face+Card, Face+PIN, Card+PIN)
- Door relay control (lock/unlock)
- Visual + audio feedback (8" touchscreen + speaker)
- SIP intercom integration
- Remote management via MQTT

---

## 2. Hardware Specifications

### 2.1 DF-970 Hardware

| Component | Specification |
|-----------|---------------|
| **Platform** | Android 11+ (Rockchip RK3568 / Qualcomm QCS6490) |
| **Display** | 8" IPS touchscreen, 1280×800, capacitive |
| **Camera** | 2MP dual-lens: RGB + IR (850nm), wide-angle, live face detection |
| **Card reader** | NFC/RFID: Mifare Classic 1K/4K, DESFire EV1/EV2/EV3, FeliCa, ISO 14443A/B |
| **Speaker** | Built-in 2W speaker |
| **Microphone** | Dual MEMS microphone (noise-canceling) |
| **Processor** | Quad-core ARM Cortex-A55 / A76, 2.0+ GHz |
| **RAM** | 4 GB LPDDR4X |
| **Storage** | 32 GB eMMC |
| **Network** | Ethernet (10/100/1000), WiFi 5 (802.11ac), optional 4G LTE |
| **Interfaces** | Wiegand 26/34 output, 1× relay output (NO/NC), RS485, 2× GPIO, USB 2.0 |
| **Power** | PoE (802.3af) or 12V DC |
| **Enclosure** | IP65, IK08, aluminum + tempered glass |
| **Operating temp** | -20°C to +60°C |
| **Dimensions** | 240mm × 120mm × 35mm |
| **Mounting** | Wall-mount bracket, VESA-compatible |
| **Sensors** | Accelerometer (tamper detection), ambient light sensor, proximity sensor |

### 2.2 Peripheral Connections

```
┌──────────────────────────────────────┐
│           DF-970 Terminal            │
│                                      │
│  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │ IR   │  │ RGB  │  │ NFC  │      │
│  │Camera│  │Camera│  │Reader│      │
│  └──┬───┘  └──┬───┘  └──┬───┘      │
│     └────┬─────┘         │           │
│          ▼               ▼           │
│  ┌──────────────────────────┐       │
│  │   Android App (Kotlin)    │       │
│  │   + Face SDK + MQTT       │       │
│  └──────┬──────┬──────┬─────┘       │
│         │      │      │             │
└─────────┼──────┼──────┼─────────────┘
          │      │      │
    ┌─────┘      │      └─────┐
    ▼            ▼            ▼
┌────────┐ ┌────────┐  ┌────────┐
│Wiegand │ │ Relay  │  │ RS485  │
│Output  │ │ Output │  │(ext.   │
│(to ctlr)│ │(door  │  │reader) │
│        │ │ lock)  │  │        │
└────────┘ └────────┘  └────────┘
```

---

## 3. App Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  DM3 Terminal App (Kotlin)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    UI Layer (Jetpack Compose)              │   │
│  │  Standby → Recognition → Granted/Denied → Admin Menu     │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────┼───────────────────────────────┐   │
│  │                 Application Layer                          │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │ Face       │ │ Card       │ │ Access     │           │   │
│  │  │ Recognition│ │ Reader     │ │ Decision   │           │   │
│  │  │ Manager    │ │ Manager    │ │ Engine     │           │   │
│  │  └────────────┘ └────────────┘ └────────────┘           │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │ Sync       │ │ Command    │ │ Door       │           │   │
│  │  │ Manager    │ │ Handler    │ │ Controller │           │   │
│  │  └────────────┘ └────────────┘ └────────────┘           │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────┼───────────────────────────────┐   │
│  │                 Infrastructure Layer                       │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │ MQTT       │ │ Room DB    │ │ Hardware   │           │   │
│  │  │ Foreground │ │ (SQLite)   │ │ HAL        │           │   │
│  │  │ Service    │ │            │ │ (relay,    │           │   │
│  │  │ (HiveMQ)   │ │            │ │  GPIO,     │           │   │
│  │  │            │ │            │ │  Wiegand)  │           │   │
│  │  └────────────┘ └────────────┘ └────────────┘           │   │
│  │  ┌────────────┐ ┌────────────┐                           │   │
│  │  │ Face SDK   │ │ SIP Client │                           │   │
│  │  │ (Megvii)   │ │ (Ooh323)  │                           │   │
│  │  └────────────┘ └────────────┘                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Components

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **UI Layer** | Jetpack Compose | Screens: standby, recognition, result, admin menu |
| **Face Recognition Manager** | Megvii SDK (ArcFace v3) | Camera control, face detection, template extraction, 1:N match |
| **Card Reader Manager** | Android NFC API + Duali SDK | Card UID read, DESFire secure read |
| **Access Decision Engine** | Kotlin (coroutines) | Local offline-first decision algorithm |
| **Sync Manager** | Kotlin coroutines | Full/incremental sync, offline queue drain |
| **Command Handler** | Kotlin | Process server commands (door control, reboot, display) |
| **Door Controller** | HAL (JNI/GPIO) | Relay pulse, door sensor monitoring |
| **MQTT Service** | HiveMQ MQTT Client (Android) | Persistent foreground service, auto-reconnect |
| **Room DB** | Room (SQLite) | Local person DB, access rules, event queue |
| **Face SDK** | Megvii MegFace v3 | Face detection, liveness, template extraction/matching |
| **SIP Client** | ooh323c / Ooh323 library | Intercom calling to door stations |
| **Hardware HAL** | JNI → C/C++ native | Relay, GPIO, Wiegand, RS485 control |

### 3.3 Android Services

| Service | Type | Purpose |
|---------|------|---------|
| `MqttForegroundService` | Foreground | Persistent MQTT connection, survives app lifecycle |
| `SyncWorker` | WorkManager (periodic) | Background person DB sync every 5 min |
| `EventUploadWorker` | WorkManager (constrained) | Upload queued events when network available |
| `HeartbeatWorker` | WorkManager (periodic) | Heartbeat every 30s |
| `FaceRecognitionService` | Bound | Camera preview + continuous face detection |
| `DoorMonitorService` | Foreground | GPIO monitoring for door sensor, tamper |

---

## 4. Local Database Schema (Room / SQLite)

### 4.1 Entity: `PersonEntity`

```kotlin
@Entity(tableName = "persons")
data class PersonEntity(
    @PrimaryKey val personId: String,
    val name: String,
    val status: String = "active",     // active | suspended | terminated
    val validFrom: Long? = null,       // Unix ms
    val validUntil: Long? = null,      // Unix ms
    val photoRef: String? = null,      // Local file path for display photo
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
```

### 4.2 Entity: `CredentialEntity`

```kotlin
@Entity(
    tableName = "credentials",
    indices = [
        Index(value = ["type", "value"], unique = true),
        Index(value = ["personId"])
    ]
)
data class CredentialEntity(
    @PrimaryKey val id: String,
    val personId: String,
    val type: String,                  // face | card | pin | qr | fingerprint
    val value: String,                 // face: template bytes (Base64), card: UID hex, pin: hash
    val templateVersion: String? = null, // e.g., "arcface_v3"
    val status: String = "active",
    val validFrom: Long? = null,
    val validUntil: Long? = null
)
```

### 4.3 Entity: `FaceTemplateEntity`

Separate table for face templates (large binary data, optimized for 1:N search).

```kotlin
@Entity(
    tableName = "face_templates",
    indices = [Index(value = ["personId"])]
)
data class FaceTemplateEntity(
    @PrimaryKey val id: String,
    val personId: String,
    val template: ByteArray,           // Raw face template (~2KB, ArcFace v3)
    val version: String = "arcface_v3",
    val quality: Float = 0f,           // Template quality score 0-1
    val updatedAt: Long = System.currentTimeMillis()
)
```

### 4.4 Entity: `AccessRuleEntity`

```kotlin
@Entity(tableName = "access_rules")
data class AccessRuleEntity(
    @PrimaryKey val ruleId: String,
    val name: String,
    val doorIds: String,               // JSON array: ["door-001", "door-002"]
    val personGroupIds: String,        // JSON array: ["group-001"]
    val scheduleJson: String?,         // JSON: {timezone, periods}
    val antiPassback: Boolean = false,
    val multiFactor: Boolean = false,
    val multiFactorMethods: String?,   // JSON array: ["face", "card"]
    val maxFailedAttempts: Int = 5,
    val lockoutDurationMs: Long = 300000,
    val priority: Int = 0,
    val enabled: Boolean = true,
    val validFrom: Long? = null,
    val validUntil: Long? = null
)
```

### 4.5 Entity: `PersonGroupEntity`

```kotlin
@Entity(tableName = "person_groups")
data class PersonGroupEntity(
    @PrimaryKey val groupId: String,
    val personIds: String              // JSON array: ["person-001", "person-002"]
)
```

### 4.6 Entity: `BlacklistEntity`

```kotlin
@Entity(tableName = "blacklist")
data class BlacklistEntity(
    @PrimaryKey val personId: String,
    val name: String?,
    val reason: String?,               // terminated | security_threat | lost_credential
    val effectiveFrom: Long?,
    val effectiveUntil: Long?,
    val credentialsJson: String?       // JSON array of credential objects
)
```

### 4.7 Entity: `EventQueueEntity`

```kotlin
@Entity(
    tableName = "event_queue",
    indices = [Index(value = ["status", "timestampMs"])]
)
data class EventQueueEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val messageId: String,             // UUIDv7
    val timestampMs: Long,
    val topic: String,
    val payloadJson: String,
    val retryCount: Int = 0,
    val status: String = "pending",    // pending | sent | failed
    val createdAt: Long = System.currentTimeMillis()
)
```

### 4.8 Entity: `SyncStateEntity`

```kotlin
@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val key: String,       // person_db_version, rules_version, etc.
    val value: String,
    val updatedAt: Long = System.currentTimeMillis()
)
```

### 4.9 Entity: `ConfigEntity`

```kotlin
@Entity(tableName = "config")
data class ConfigEntity(
    @PrimaryKey val key: String,
    val valueJson: String
)
```

### 4.10 Entity: `AntiPassbackStateEntity`

```kotlin
@Entity(tableName = "anti_passback_state")
data class AntiPassbackStateEntity(
    @PrimaryKey val personId: String,
    val lastDirection: String,         // entry | exit
    val lastDoorId: String,
    val timestampMs: Long
)
```

### 4.11 Entity: `FailedAttemptEntity`

```kotlin
@Entity(
    tableName = "failed_attempts",
    indices = [Index(value = ["personId", "credentialType"])]
)
data class FailedAttemptEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val personId: String?,
    val credentialType: String,
    val credentialValue: String,
    val timestampMs: Long,
    val doorId: String
)
```

### Database Capacity

| Data | Per Person | 10K Persons | Notes |
|------|-----------|-------------|-------|
| Person record | ~200 B | 2 MB | Name, status, validity |
| Face template | ~2 KB | 20 MB | ArcFace v3 format |
| Card credential | ~100 B | 1 MB | UID hex string |
| Access rules | ~500 B each | 50 KB | Typically 10–100 rules |
| Event queue | ~500 B each | 2.5 MB | Max 5000 queued events |
| **Total** | | **~25 MB** | Well within 32 GB eMMC |

---

## 5. Face Recognition Flow

### 5.1 Flow Diagram

```
Camera Preview (continuous)
       │
       ▼
┌──────────────┐
│ Face Detect  │  Megvii SDK: detect faces in frame
│ (< 30ms)     │  Returns: bounding box, landmarks, quality score
└──────┬───────┘
       │ Face detected (quality > threshold)
       ▼
┌──────────────┐
│ Liveness     │  IR + RGB dual-camera liveness check
│ Check        │  Anti-spoofing: photo, screen, mask detection
│ (< 50ms)     │  Returns: liveness score (0-1)
└──────┬───────┘
       │ Liveness passed (score > 0.5)
       ▼
┌──────────────┐
│ Extract      │  Megvii SDK: extract 512-dim face template
│ Template     │  ArcFace v3 format (~2KB)
│ (< 50ms)     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 1:N Match    │  Compare against all face_templates in local DB
│ (< 20ms for  │  Top-N results sorted by similarity score
│  10K faces)  │  Threshold: configurable (default 0.75)
└──────┬───────┘
       │
       ├── Match found (confidence ≥ threshold)
       │         ▼
       │   ┌──────────────┐
       │   │ Access       │  Local decision engine (see §8)
       │   │ Decision     │  Check rules, schedule, blacklist
       │   │ Engine       │  < 5ms
       │   └──────┬───────┘
       │          │
       │          ├── GRANTED → Green UI + unlock relay + beep + event log
       │          └── DENIED  → Red UI + denial reason + beep + event log
       │
       └── No match (all scores < threshold)
                  ▼
            DENIED → "Không nhận diện được" + Red UI + event log
```

### 5.2 Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Face detection | < 30 ms | Per frame, continuous |
| Liveness check | < 50 ms | IR + RGB dual-lens |
| Template extraction | < 50 ms | ArcFace v3 |
| 1:N matching (1K faces) | < 5 ms | In-memory templates |
| 1:N matching (10K faces) | < 20 ms | In-memory templates |
| **Total recognition** | **< 150 ms** | Detect to match |
| **Total with decision** | **< 200 ms** | Detect to door unlock |

---

## 6. Card Read Flow

```
Card Tap (NFC antenna)
       │
       ▼
┌──────────────┐
│ Read UID     │  Read card UID (4, 7, or 10 bytes)
│ (< 50ms)     │  For DESFire: optional secure authentication + read
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Lookup       │  SELECT person_id FROM credentials
│ Local DB     │  WHERE type='card' AND value='{uid_hex}'
│ (< 5ms)      │  AND status='active'
└──────┬───────┘
       │
       ├── Found → Access Decision Engine (§8)
       │           ├── GRANTED → Green UI + unlock + event
       │           └── DENIED  → Red UI + reason + event
       │
       └── Not found → DENIED ("denied_unknown") + event
```

---

## 7. Multi-Factor Authentication

When a rule has `multi_factor=true`, two credentials must be presented within a 30-second window.

### 7.1 Supported Combinations

| Factor 1 | Factor 2 | Flow |
|----------|----------|------|
| Face | Card | Face recognized → prompt "Quẹt thẻ" → card read → decide |
| Face | PIN | Face recognized → prompt "Nhập mã PIN" → keypad → decide |
| Card | PIN | Card read → prompt "Nhập mã PIN" → keypad → decide |
| Card | Face | Card read → prompt "Nhìn vào camera" → face match → decide |

### 7.2 Multi-Factor Flow

```
Factor 1 presented (e.g., Card)
       │
       ▼
┌──────────────┐
│ Lookup       │  Identify person from Factor 1
│ Person       │
└──────┬───────┘
       │ Person found
       ▼
┌──────────────┐
│ Check Rule   │  Does matching rule require multi_factor?
│ Multi-Factor │
└──────┬───────┘
       │ Yes — multi_factor required
       ▼
┌──────────────┐
│ Store        │  Save pending factor: person_id + credential_type + timestamp
│ Pending      │  Start 30-second timeout
│ Factor       │
└──────┬───────┘
       │ Display: "Vui lòng quẹt thẻ / nhìn camera / nhập PIN"
       ▼
Factor 2 presented (within 30s)
       │
       ▼
┌──────────────┐
│ Verify       │  Factor 2 must match the SAME person as Factor 1
│ Same Person  │  If different person → DENIED
└──────┬───────┘
       │ Same person confirmed
       ▼
┌──────────────┐
│ Access       │  Full rule evaluation with both factors satisfied
│ Decision     │
└──────────────┘
```

---

## 8. Access Decision Engine

Identical core algorithm to the simulator (see `device-simulator.md §8`) but optimized for single-device operation in Kotlin.

### 8.1 Pseudocode (Kotlin)

```kotlin
suspend fun makeAccessDecision(
    credentialType: String,
    credentialValue: String,
    doorId: String,
    confidence: Float? = null
): AccessDecision {
    val startNs = System.nanoTime()
    val nowMs = System.currentTimeMillis()

    // Step 1: Check lockdown state
    if (lockdownActive) {
        return if (config.emergencyUnlock) {
            AccessDecision.granted("emergency_unlock")
        } else {
            AccessDecision.denied("lockdown_active")
        }
    }

    // Step 2: Lookup credential in local DB
    val credential = credentialDao.findByTypeAndValue(credentialType, credentialValue)
        ?: return AccessDecision.denied("denied_unknown")

    val person = personDao.findById(credential.personId)
        ?: return AccessDecision.denied("denied_unknown")

    // Step 3: Check blacklist (HIGHEST PRIORITY)
    if (blacklistDao.exists(person.personId)) {
        return AccessDecision.denied("denied_blacklist", person)
    }

    // Step 4: Check person active status
    if (person.status != "active") {
        return AccessDecision.denied("denied_inactive", person)
    }

    // Step 5: Check credential validity window
    if (person.validFrom != null && nowMs < person.validFrom) {
        return AccessDecision.denied("denied_expired", person)
    }
    if (person.validUntil != null && nowMs > person.validUntil) {
        return AccessDecision.denied("denied_expired", person)
    }

    // Step 6: Check failed attempt lockout
    val recentFailures = failedAttemptDao.countRecent(
        person.personId, nowMs - 600_000 // last 10 min
    )
    if (recentFailures >= config.maxFailedAttempts) {
        return AccessDecision.denied("denied_lockout", person)
    }

    // Step 7: Get matching rules (sorted by priority DESC)
    val personGroupIds = personGroupDao.getGroupsForPerson(person.personId)
    val rules = accessRuleDao.findMatchingRules(doorId, personGroupIds)

    if (rules.isEmpty()) {
        return AccessDecision.denied("denied_zone", person)
    }

    // Step 8: Evaluate rules
    for (rule in rules) {
        if (!rule.enabled) continue
        if (rule.validFrom != null && nowMs < rule.validFrom) continue
        if (rule.validUntil != null && nowMs > rule.validUntil) continue

        val doorIds = Json.decodeFromString<List<String>>(rule.doorIds)
        if (doorId !in doorIds) continue

        val ruleGroupIds = Json.decodeFromString<List<String>>(rule.personGroupIds)
        if (personGroupIds.none { it in ruleGroupIds }) continue

        // Check schedule
        if (rule.scheduleJson != null) {
            if (!evaluateSchedule(rule.scheduleJson, nowMs)) continue
        }

        // Check anti-passback
        if (rule.antiPassback) {
            val lastState = antiPassbackDao.findByPerson(person.personId)
            if (lastState?.lastDirection == currentDirection) {
                return AccessDecision.denied("denied_anti_passback", person)
            }
        }

        // Check multi-factor
        if (rule.multiFactor) {
            val pendingFactor = pendingFactorStore.get(person.personId)
            if (pendingFactor == null) {
                // First factor — store and wait for second
                pendingFactorStore.store(person.personId, credentialType, nowMs)
                return AccessDecision.pendingMultiFactor(person)
            }
            if (pendingFactor.credentialType == credentialType) {
                // Same factor type presented twice — need different factor
                return AccessDecision.pendingMultiFactor(person, "different_factor_required")
            }
            if (nowMs - pendingFactor.timestampMs > 30_000) {
                // Timeout — clear and deny
                pendingFactorStore.clear(person.personId)
                return AccessDecision.denied("denied_mfa_timeout", person)
            }
            // Second factor valid — clear pending and proceed
            pendingFactorStore.clear(person.personId)
        }

        // ✅ GRANTED
        val decisionTimeMs = (System.nanoTime() - startNs) / 1_000_000.0
        return AccessDecision.granted(
            reason = "authorized",
            person = person,
            ruleId = rule.ruleId,
            decisionTimeMs = decisionTimeMs,
            confidence = confidence
        )
    }

    // No matching rule
    return AccessDecision.denied("denied_time", person)
}
```

### 8.2 Post-Decision Actions

```kotlin
suspend fun onDecision(decision: AccessDecision, credentialType: String, doorId: String) {
    if (decision.granted) {
        // Unlock door relay
        hardwareHal.pulseRelay(doorId, config.unlockDurationMs)
        // Update anti-passback state
        antiPassbackDao.upsert(decision.personId, currentDirection, doorId)
        // Reset failed attempts
        failedAttemptDao.clearForPerson(decision.personId)
        // UI: green checkmark + name + photo
        uiState.emit(UiState.Granted(decision.personName, decision.photo))
        // Audio: success beep
        audioManager.playGranted()
    } else {
        // Increment failed attempts
        failedAttemptDao.insert(decision.personId, credentialType, doorId)
        // UI: red X + reason
        uiState.emit(UiState.Denied(decision.reason))
        // Audio: denial beep
        audioManager.playDenied()
    }

    // Create and queue access.log event
    val event = createAccessLogEvent(decision, credentialType, doorId)
    if (mqttService.isConnected) {
        mqttService.publish(event)
    } else {
        eventQueueDao.insert(event)
    }
}
```

---

## 9. MQTT Topics Consumed & Published

Reference: `mqtt-protocol.md`

### 9.1 MQTT Client Configuration

| Parameter | Value |
|-----------|-------|
| **Library** | HiveMQ MQTT Client for Android |
| **Protocol** | MQTT 5.0 |
| **Transport** | TLS (port 8883) — certificate pinning |
| **Keep Alive** | 60 seconds |
| **Session Expiry** | 3600 seconds (persistent session) |
| **Clean Start** | false (resume session on reconnect) |
| **Auto Reconnect** | Yes, exponential backoff (1s → 5s → 15s → 30s → 60s) |
| **Max Inflight** | 10 (QoS 1/2 messages) |

### 9.2 Subscriptions (Server → Device)

| Topic | QoS | Message Types | Handler |
|-------|-----|---------------|---------|
| `dm/{tid}/device/{did}/cmd` | 2 | `cmd.door`, `cmd.reboot`, `cmd.display`, `cmd.snapshot` | `CommandHandler` |
| `dm/{tid}/device/{did}/cfg` | 2 | `cfg.full`, `cfg.patch`, `cfg.person_sync`, `cfg.access_rules`, `cfg.blacklist`, `cfg.firmware` | `SyncManager` |
| `dm/{tid}/emergency/broadcast` | 2 | `cmd.lockdown` | `EmergencyHandler` |

### 9.3 Publications (Device → Server)

| Topic | QoS | Message Types | Trigger |
|-------|-----|---------------|---------|
| `dm/{tid}/device/{did}/evt` | 1 | `access.log` | After every access decision |
| `dm/{tid}/device/{did}/evt` | 1 | `door.state` | Door sensor change |
| `dm/{tid}/device/{did}/evt` | 1 | `alarm.triggered` | Tamper, forced door, held open |
| `dm/{tid}/device/{did}/sta` | 0 | `status.heartbeat` | Every 30 seconds |
| `dm/{tid}/device/{did}/cmd/resp` | 2 | `cmd.door.resp`, `cmd.snapshot.resp` | After command execution |
| `dm/{tid}/device/{did}/cfg/ack` | 2 | `cfg.person_sync.ack`, `cfg.access_rules.ack` | After sync processing |

### 9.4 LWT

- **Topic:** `dm/{tid}/device/{did}/sta`
- **Payload:** `{"v":1, "type":"status.offline", "data":{"reason":"unexpected_disconnect"}}`

---

## 10. Sync Protocol

### 10.1 Boot Sequence

```
1. App starts → MqttForegroundService starts
2. Load config from Room DB (or factory defaults if first boot)
3. TLS handshake → CONNECT (device_id as username, JWT as password)
4. Subscribe to cmd, cfg, emergency topics
5. Publish status.heartbeat (person_db_version=0 on first boot)
6. Server detects version=0 → triggers full sync
7. Receive cfg.full → store in config table → ack
8. Receive cfg.person_sync (action=full_sync, batched) → upsert persons + credentials → ack per batch
9. Receive cfg.access_rules (action=full_sync) → store rules → ack
10. Receive cfg.blacklist (action=full_sync) → store blacklist → ack
11. Update sync_state: person_db_version, rules_version, blacklist_version
12. Device READY — begin accepting access credentials
```

### 10.2 Incremental Sync

- Heartbeat includes `local_db_version`, `rules_version`, `blacklist_version`
- Server compares versions and sends only deltas
- `cfg.person_sync` with `action=upsert` or `action=delete` for changed persons
- `cfg.access_rules` with `action=delta` for changed rules
- `cfg.blacklist` with `action=add`/`action=remove` for blacklist changes

### 10.3 Blacklist Priority Sync

Blacklist updates are **QoS 2** and must be processed **immediately** — before the next access decision. The `SyncManager` processes blacklist messages with highest priority, blocking the access decision engine until the blacklist is updated.

### 10.4 Offline Event Queue

When MQTT is disconnected:
1. Events written to `event_queue` table in Room DB
2. Max queue size: 5,000 events (configurable via `cfg.full.network.offline_queue_max`)
3. When queue is full, oldest events are dropped (log warning)
4. On reconnect: heartbeat reports `queue_depth > 0`
5. Events uploaded FIFO at 100 events/sec
6. Each event retried up to 3 times; after 3 failures → status=failed

---

## 11. UI Screens

### 11.1 Screen Flow

```
┌──────────────┐     face detected     ┌──────────────┐
│   Standby    │ ───────────────────► │ Recognition  │
│              │     card tapped       │              │
│  Clock       │ ───────────────────► │ Camera Feed  │
│  Logo        │                       │ "Đang nhận   │
│  Date        │                       │  diện..."    │
│  "Offline"   │                       │              │
│  indicator   │                       └──────┬───────┘
└──────────────┘                              │
       ▲                           ┌──────────┴──────────┐
       │                           ▼                      ▼
       │                   ┌──────────────┐       ┌──────────────┐
       │   3 seconds       │   Granted    │       │   Denied     │
       └───────────────────│              │       │              │
       │                   │ ✅ Green BG   │       │ ❌ Red BG     │
       │   3 seconds       │ Name + Photo │       │ Reason       │
       └───────────────────│ "Xin chào,   │       │ "Thẻ hết hạn"│
                           │  Nguyễn Văn A"│       │              │
                           └──────────────┘       └──────────────┘

                           ┌──────────────┐
                           │  Admin Menu  │  (PIN protected: hold 5s on logo)
                           │              │
                           │ • Network    │
                           │ • Sync status│
                           │ • Device info│
                           │ • Diagnostics│
                           │ • Restart    │
                           └──────────────┘
```

### 11.2 Screen Details

| Screen | Content | Duration |
|--------|---------|----------|
| **Standby** | Clock (HH:MM:SS), date, company logo, offline indicator (orange dot if disconnected) | Until interaction |
| **Recognition** | Camera preview with face detection overlay, "Đang nhận diện..." spinner | < 200ms (auto) |
| **Granted** | Green background, ✅ checkmark, person name, person photo (from local DB), "Xin chào, [Name]" | 3 seconds |
| **Denied** | Red background, ❌ mark, denial reason (localized Vietnamese/English), "Từ chối: [reason]" | 3 seconds |
| **Multi-Factor Prompt** | Blue background, instruction: "Vui lòng quẹt thẻ" / "Nhập mã PIN", 30s countdown | 30 seconds |
| **Admin Menu** | Settings list: network status, sync versions, person count, device ID, diagnostics, restart | Until exit |
| **Display Message** | Server-pushed message (cmd.display), configurable color and duration | Configurable |

### 11.3 Offline Indicator

- **Connected:** No indicator (clean screen)
- **Disconnected < 5 min:** Orange dot + "Offline" text in top-right corner
- **Disconnected > 5 min:** Orange banner: "Chế độ ngoại tuyến — Hệ thống vẫn hoạt động bình thường"
- **Access decisions continue normally** in all offline states

---

## 12. OTA Updates

### 12.1 Firmware Update Flow

```
1. Server publishes cfg.firmware to device
2. Device validates: version > current, checksum format valid
3. If force=false: schedule download at specified time (or 2 AM default)
   If force=true: download immediately
4. Download APK from URL (HTTPS, resume-capable)
5. Verify SHA-256 checksum
6. Install via Android PackageInstaller (device owner mode)
7. App restarts → boot sequence → sync
8. Heartbeat reports new firmware version
```

### 12.2 Rollback

- Previous APK retained on device
- If new version fails to start 3 times → auto-rollback to previous
- Server can issue `cfg.firmware` with previous version to force rollback

---

## 13. Device Management

### 13.1 Remote Configuration

All settings in `cfg.full` can be updated remotely:

| Category | Settings |
|----------|----------|
| **Recognition** | `face_threshold` (0.5–0.99), `face_liveness` (on/off), `methods_enabled` (face/card/qr), `multi_factor` |
| **Display** | `language` (vi/en), `idle_message`, `logo_url`, `theme` (dark/light), `screensaver_timeout_ms` |
| **Schedule** | `timezone`, `auto_lock_cron`, `auto_unlock_cron` |
| **Network** | `heartbeat_interval_ms`, `offline_queue_max`, `ntp_server` |
| **Access** | `door_unlock_duration_ms`, `anti_passback`, `max_failed_attempts`, `lockout_duration_ms` |
| **Hardware** | Volume (0–100), brightness (0–100), camera resolution |

### 13.2 Remote Commands

| Command | Action |
|---------|--------|
| `cmd.reboot` | Graceful restart with configurable delay |
| `cmd.display` | Show custom message on screen |
| `cmd.snapshot` | Capture and return camera image |
| `cmd.door` | Remote unlock/lock/hold_open |

### 13.3 Log Upload

- Device maintains 7 days of app logs (Logcat)
- Server can request log upload via command
- Logs uploaded to MinIO via HTTPS (pre-signed URL)

---

## 14. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **MQTT in transit** | TLS 1.3 mandatory, certificate pinning (backup pin for rotation) |
| **Local DB at rest** | SQLCipher encryption (AES-256-CBC) for Room database |
| **Face templates** | Stored encrypted in local DB; never transmitted except during sync |
| **Tamper detection** | Accelerometer monitoring; `alarm.triggered` (type=tamper) on impact/removal |
| **Admin access** | PIN-protected admin menu (configurable 6-digit PIN, default changed on provision) |
| **USB debugging** | Disabled in production builds; ADB over network disabled |
| **Secure boot** | Android Verified Boot (AVB) ensures signed OS and app |
| **JWT token rotation** | Token refreshed every 24h via `cfg` topic; expired tokens rejected |
| **Anti-spoofing** | IR liveness detection prevents photo/screen attacks |
| **Brute force** | Lockout after N failed attempts (configurable, default 5) |

---

## 15. Intercom Integration

### 15.1 SIP Client

| Parameter | Value |
|-----------|-------|
| **Protocol** | SIP over TLS |
| **Codec** | Opus (voice), H.264 (video) |
| **Server** | Configured via `cfg.full` |
| **Call flow** | Visitor presses call button → SIP INVITE to reception/resident → Answer → audio/video stream → Remote unlock option |

### 15.2 Intercom Flow

```
Visitor presses "Call" on terminal screen
       │
       ▼
┌──────────────┐
│ SIP INVITE   │  → Registered SIP endpoint (guard station / mobile app)
│ to reception │
└──────┬───────┘
       │ Call answered
       ▼
┌──────────────┐
│ Audio/Video  │  Terminal camera → recipient screen
│ Stream       │  Recipient mic → terminal speaker
└──────┬───────┘
       │ Recipient presses "Open"
       ▼
┌──────────────┐
│ Remote       │  SIP DTMF or SIP INFO → terminal → relay pulse
│ Unlock       │  Logged as access.log with method="intercom"
└──────────────┘
```

---

## 16. Local Diagnostics API

Local REST API accessible on LAN only (port 8080, bound to device IP).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Device health: uptime, memory, storage, CPU |
| `GET` | `/api/sync` | Sync status: versions, last sync time, queue depth |
| `GET` | `/api/persons/count` | Local person DB count |
| `GET` | `/api/events/recent` | Last 50 access events |
| `GET` | `/api/network` | Network status: IP, MQTT connected, latency |
| `GET` | `/api/hardware` | Peripheral status: camera, reader, relay, sensor |
| `POST` | `/api/relay/test` | Test relay pulse (requires admin PIN in header) |
| `POST` | `/api/reader/test` | Read next card and return UID (debug mode) |

**Security:** API requires `X-Admin-Pin` header with device admin PIN.

---

## 17. Configuration Options

### 17.1 Provisioning

First-boot provisioning:
1. Connect to WiFi/Ethernet
2. Scan QR code from DM3 server (contains: tenant_id, device_id, broker URL, JWT)
3. App configures MQTT connection and begins initial sync
4. Alternative: MDM (Mobile Device Management) push configuration

### 17.2 Factory Reset

- Long-press hardware reset button (10 seconds)
- Or via admin menu → Factory Reset
- Clears: local DB, config, credentials, cached photos
- Retains: Android OS, app APK
- Device returns to provisioning mode

---

## 18. Monitoring & Diagnostics

| Signal | Source | Frequency |
|--------|--------|-----------|
| Heartbeat | `status.heartbeat` via MQTT | Every 30s |
| CPU/Memory/Disk | Included in heartbeat | Every 30s |
| Peripheral status | Camera, reader, relay, printer | Every heartbeat |
| Queue depth | Pending offline events | Every heartbeat |
| Face recognition stats | Match rate, avg confidence, avg latency | Every 5 min (aggregated in heartbeat metadata) |
| Network quality | MQTT latency, WiFi signal, packet loss | Every heartbeat |
| Local DB versions | person_db, rules, blacklist versions | Every heartbeat |

---

## 19. Deployment & Installation

### 19.1 Physical Installation

1. Mount bracket on wall at 1.4m height (face-level)
2. Run Ethernet cable (PoE) or power + network cables
3. Connect relay wires to door lock (NO/NC)
4. Connect door sensor wires to GPIO input
5. Power on → Android boot → DM3 app auto-starts

### 19.2 Software Provisioning

1. App auto-launches on boot (Device Owner mode via Android Enterprise)
2. Scan provisioning QR code or receive MDM configuration
3. MQTT connects → initial sync begins
4. Device ready in 2–5 minutes (depending on person DB size)

### 19.3 Android Enterprise / Kiosk Mode

- App runs as Device Owner (full kiosk mode)
- Navigation bar hidden
- Status bar hidden
- No access to other apps
- Auto-restart on crash (3-second delay)
- Boot directly into DM3 app

---

## 20. Testing Approach

| Test Type | Scope | Tools |
|-----------|-------|-------|
| **Unit tests** | Decision engine, schedule evaluator, DB queries | JUnit 5, Mockito, Robolectric |
| **Integration tests** | MQTT client, Room DB, sync protocol | AndroidX Test, Testcontainers (EMQX) |
| **UI tests** | Screen flows, display content | Espresso, Compose Testing |
| **Hardware tests** | Relay pulse, card read, GPIO | Manual + automated on physical device |
| **Face recognition tests** | Accuracy, liveness detection, performance | Megvii test suite + custom dataset |
| **Offline tests** | Event queuing, sync on reconnect, decision continuity | Network-conditioned test environment |
| **Performance tests** | Decision < 50ms, face match < 20ms with 10K templates | Android Benchmark |
| **Security tests** | Certificate pinning, DB encryption, tamper detection | OWASP Mobile Testing Guide |

### Key Test Scenarios

1. **Cold boot to ready:** App starts → syncs 10K persons → ready in < 5 min
2. **Offline access:** Disconnect network → 100 access events → reconnect → all events uploaded
3. **Blacklist priority:** Blacklist push arrives → person denied on next attempt (< 1s)
4. **Multi-factor timeout:** Card tap → wait 31s → denied (MFA timeout)
5. **Face recognition accuracy:** 99.5%+ true accept rate at 0.001% false accept rate
6. **Anti-passback enforcement:** Entry → second entry attempt → denied
7. **Emergency lockdown:** Broadcast received → all doors lock within 500ms
8. **OTA update:** Firmware push → download → install → reboot → new version in heartbeat

---

## 21. Integration Points

- **Depends on:** EMQX broker, DM3 server (device-gw for sync orchestration)
- **Hardware:** DF-970 platform, Megvii face SDK license
- **Consumed by:** access-svc (event logs), video-svc (snapshots), attend-svc (clock-in)
- **External:** NTP server, SIP server (intercom), MDM (provisioning)

---

## 22. Notes

- Face templates are ArcFace v3 format (~2KB each, 512-dimensional float vector). The Megvii SDK handles extraction and matching.
- The DF-970 has a dedicated NPU (Neural Processing Unit) for accelerated face detection inference. Use NNAPI delegate when available.
- Anti-passback state resets daily at midnight (configurable) to handle edge cases.
- The terminal should display the person's stored photo (from local DB) on the Granted screen, not the live camera capture, for consistency.
- Maximum recommended persons per device: 10,000 (limited by face template matching performance).
- For deployments > 10K persons, consider partitioning by zone — each terminal only syncs persons with access to its zone.
