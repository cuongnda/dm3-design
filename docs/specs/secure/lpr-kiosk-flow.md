# Feature: LPR Kiosk Walk-in Registration

> Domain: SECURE | Color: #3B82F6 | Priority: P1
> Status: Draft | Owner: SECURE Team
> Related: `docs/specs/operate/parking.md`, `docs/specs/secure/access-control.md`, `docs/architecture/mqtt-protocol.md` §7.8

## Overview

The LPR (License Plate Recognition) kiosk is a Windows-based WPF client
(`lpr-desktop-app`) that sits at a site entrance and registers walk-in
visitors on behalf of a human operator. It is **not** an MQTT-provisioned
DM3 device: it authenticates to the DM3 server over HTTPS using a long-lived
tenant-scoped bearer token and posts visitor registrations to the legacy-
shaped `/register-visit` adapter on visitor-svc.

The kiosk hosts three local sensors:

| Sensor | Purpose | Output |
| --- | --- | --- |
| LPR camera | Read vehicle plate via OCR | plate string + snapshot |
| CCCD reader | Scan Vietnamese national ID chip | `PersonDetail` + face photo (base64) |
| UHF reader | Scan RFID tags on registered vehicles | tag UID |

It also holds a local SQLite `Users` table that caches registered visitors
so barrier decisions keep working during a network outage.

## End-to-end Flow

```mermaid
sequenceDiagram
    autonumber
    actor Operator
    participant Kiosk as LPR Kiosk (WPF)
    participant LocalDB as Kiosk SQLite
    participant Visitor as visitor-svc :8006
    participant MinIO as MinIO
    participant NATS as NATS JetStream
    participant Gateway as device-gateway :8002
    participant Parking as parking-svc :8007
    participant Terminal as Door Terminal (MQTT)

    Note over Kiosk: Vehicle arrives at entrance
    Kiosk->>Kiosk: LPR camera emits VehicleDetected(plate)
    Kiosk->>LocalDB: SELECT * FROM Users WHERE CardId = plate

    alt plate already registered
        LocalDB-->>Kiosk: hit (UserId, valid window)
        Kiosk->>Terminal: MQTT access.log (plate matched)
        Note over Kiosk,Terminal: Barrier opens locally; no server call
    else unknown plate — operator registers
        Operator->>Kiosk: click "Add Visitor"
        Kiosk->>Kiosk: CCCD reader returns PersonDetail + face base64
        Operator->>Kiosk: choose cardType 1 (card) or 6 (plate), confirm
        Kiosk->>Visitor: POST /register-visit?companyCode=<code>\nBearer dm3kiosk_<hex>\n{visitorName, nationalIdNumber, avatar b64, cardList[...]}
        Visitor->>Visitor: KioskAuthMiddleware → tenant_id
        Visitor->>MinIO: PutObject(tenants/{tid}/visitor/visitors/{vid}/photo.jpg)
        Visitor->>Visitor: INSERT dm3_visitor.visitors, visits (status='approved')

        alt cardType = 1 (card)
            Visitor->>Visitor: INSERT dm3_visitor.temp_credentials (type='card')
            Visitor->>NATS: publish dm3.visitor.{tid}.visit.approved
            NATS-->>Gateway: VisitorConsumer receives event
            Gateway->>Terminal: MQTT cfg.visitor_sync (visit + credential)
        else cardType = 6 (plate)
            Visitor->>Visitor: UPSERT dm3_parking.parking_vehicles (visitor_id, plate)
            Note over Visitor,Parking: No cfg.visitor_sync for plate-only visits.\nBarrier LPR matches via parking-svc directly.
        end

        Visitor-->>Kiosk: 200 {qrCode, visiteeName, visitId (int31), visit_id (uuid)}
        Kiosk->>LocalDB: INSERT Users(UserId='V{visitId}', CardId=<plate|card>, ...)
    end

    Note over Kiosk,Terminal: Later: same vehicle returns → local SQLite hit → barrier opens
```

## Payload Contract

**Endpoint:** `POST /register-visit` (bare path, alias of
`POST /api/v1/visitors/legacy-register`)
**Auth:** `Authorization: Bearer dm3kiosk_<64 hex chars>`
**Query:** `?companyCode=<tenant code>&visitTargetId=0&generateImageQrCode=false`

Shape intentionally mirrors the legacy demasterpro.com API so deployed .NET
kiosks work without firmware changes (see
`lpr-desktop-app/LPRApplication/Models/RabbitMQMessages.cs:VisitorRequest`).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `visitorName` | string | yes | `"Nguyễn Văn A"` |
| `nationalIdNumber` | string | no | Vietnamese CCCD digits. Used as upsert key on repeat walk-ins. |
| `birthDay` | string | no | `"dd.MM.yyyy"` |
| `address` | string | no | Free text |
| `avatar` | string | no | Base64 JPEG from CCCD chip. Server caps at 2 MB, uploads to MinIO. |
| `startDate` | string | yes | `"dd.MM.yyyy HH:mm:ss"` |
| `endDate` | string | yes | `"dd.MM.yyyy HH:mm:ss"`. `DateTime.MaxValue` caps at `startDate + 24h`. |
| `visitReason` | string | no | Free text, surfaced to operators |
| `cardList[0].cardId` | string | yes | Plate or card UID |
| `cardList[0].cardType` | int | yes | `1` = card, `6` = license plate |
| `accessGroupId` | int | — | **Ignored**; server uses `visitor_settings.default_access_areas` |
| `visitType` | string | — | **Ignored** |

**Response:**

```json
{
  "qrCode": "<visit.qr_token>",
  "imageQrCode": "",
  "visiteeName": "Nguyễn Văn A",
  "visitId": 123456789,                  // 31-bit hash of UUID (legacy int field)
  "visit_id": "1234abcd-...-..."         // canonical UUID (new)
}
```

## Credential Routing

The plugin boundary is strictly preserved: **door access stays in visitor
plugin, vehicle access stays in parking plugin.** The adapter routes the
inbound `cardType` to the right table; no new credential `type` enum value
is introduced.

| `cardType` | Persisted to | Access decision path |
| --- | --- | --- |
| `1` (card) | `dm3_visitor.temp_credentials { type:'card', value:<uid> }` | Door terminal receives `cfg.visitor_sync` MQTT → matches locally → opens door |
| `6` (plate) | `dm3_parking.parking_vehicles { visitor_id, plate_number, normalized_plate, category:'visitor' }` | Barrier LPR camera → parking-svc → matches on `normalized_plate` → opens barrier |

`visits.vehicle_plate` is populated for either path when a plate is
submitted, so operator UI can show it without joining `parking_vehicles`.

Re-registering the same plate for a different visitor **rebinds** the
`parking_vehicles` row via `ON CONFLICT (tenant_id, normalized_plate) DO
UPDATE SET visitor_id = EXCLUDED.visitor_id, ...`. The old visit stays in
`dm3_visitor.visits`; only the vehicle's current owner flips.

## Prerequisites on the Server

The adapter refuses to create a walk-in until the tenant has configured both
defaults on `dm3_visitor.visitor_settings`:

- `default_host_user_id UUID` — who "owns" these walk-ins for the legal
  host-user-required field on `visits`. Pick any active user
  (e.g. a reception account).
- `default_access_areas UUID[]` — the zones walk-ins are authorised to
  enter. Empty array is allowed but means the visitor can't open interior
  doors via `cfg.visitor_sync` (vehicle barrier access still works because
  it flows through parking-svc, which has its own zone model).

Missing `default_host_user_id` returns `412 Precondition Failed`.

## Kiosk Token Lifecycle

Tokens live in `dm3_auth.kiosk_tokens` and are hashed at rest (SHA-256
over the cleartext). Plain-text never leaves the DB except on create —
the admin sees it exactly once.

| Action | Endpoint | Who |
| --- | --- | --- |
| Mint | `POST /api/v1/visitors/kiosk-tokens` | Admin with `company.settings.manage`. Returns cleartext `dm3kiosk_<64hex>` once; operator pastes into kiosk settings. |
| List | `GET /api/v1/visitors/kiosk-tokens` | Same. Metadata only; no cleartext. |
| Revoke | `DELETE /api/v1/visitors/kiosk-tokens/{id}` | Same. Sets `revoked_at`; kiosk gets 401 on next call. |

Design note — why the token is **not** distributed via `Transmit Data`:

1. Scope mismatch: tokens are tenant-wide; sync config is per-device.
2. Secrecy: long-lived bearer tokens don't belong in MQTT session
   history or `cfg.*` payloads on multiple devices.
3. Revocation: a revoked token must stop working instantly; a
   push-based model would add lag.

Future work (not v1): QR-based config hand-off so an operator can scan
`{ApiBaseUrl, CompanyCode, KioskToken}` into the kiosk in one step instead
of pasting three fields.

## Offline Behaviour

The kiosk's local SQLite `Users` cache is the source of truth for
already-registered visitors — re-entry works with no server connectivity.
The only online-required moments are:

1. Initial registration (the `POST /register-visit` call). If the network is
   down, the operator can still physically admit the vehicle and record the
   registration later; the kiosk caches the request and retries on
   reconnect (existing behaviour from the demasterpro.com era).
2. Revocation pick-up (the kiosk does not currently pull revocations —
   a revoked visitor stays in local SQLite until its `ValidUntil` expires).

## Implementation References

| Concern | File |
| --- | --- |
| Adapter handler | `backend/internal/visitor/legacy_register_handler.go` |
| Kiosk auth middleware | `backend/internal/visitor/kiosk_auth.go` |
| Token admin CRUD | `backend/internal/visitor/kiosk_token_handlers.go` |
| Route wiring | `backend/cmd/visitor-svc/main.go` |
| Migration | `backend/pkg/db/migrations/000038_kiosk_tokens_and_visitor_defaults.up.sql` |
| Visitor→device sync | `backend/internal/gateway/sync_visitor.go` |
| Visitor NATS consumer | `backend/internal/gateway/visitor_consumer.go` |
| Client register call | `lpr-desktop-app/LPRApplication/Services/VehicleEventService.cs:RegisterVisitorAsync` |
| Client settings | `lpr-desktop-app/LPRApplication/Models/AppSettings.cs` |
| Response DTO | `lpr-desktop-app/LPRApplication/Models/RabbitMQMessages.cs:VisitorResponse` |

## Open Items

- No acknowledgement-back-to-kiosk path for visit revocations — the
  kiosk's local SQLite can hold a stale entry until `ValidUntil`.
- Kiosk is not a first-class DM3-provisioned device; it doesn't appear in
  the device registry. Future option: run bootstrap on the kiosk and mint
  kiosk tokens via device JWT so lifecycle is unified.
- Server-initiated cache invalidation: today the kiosk only re-syncs on
  next registration. A periodic pull against a tenant-scoped revocation
  endpoint would close the gap.
