# Feature: Parking Management

> Domain: OPERATE | Color: #4CAF50 | Priority: P1
> Status: NOT IMPLEMENTED | Owner: parking-svc team

## Overview
Parking Management handles vehicle entry/exit, space occupancy tracking, license plate recognition (LPR), reservations, monthly passes, EV charging, and fee calculation for multi-level parking facilities. Designed for Vietnamese parking contexts including motorbikes, cars, and bicycles with LPR as the primary access method. Integrates with barrier controllers, LPR cameras, and payment gateways.

## Data Models

### ParkingZone
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Zone name (e.g., "Hầm B1", "Bãi xe máy") |
| type | ZoneType | yes | — | Zone category |
| level | text | no | — | Floor/level identifier |
| total_spaces | int | yes | — | Total parking spaces |
| vehicle_types | VehicleType[] | yes | — | Allowed vehicle types |
| entry_devices | jsonb | yes | [] | Entry barrier/camera device refs |
| exit_devices | jsonb | yes | [] | Exit barrier/camera device refs |
| operating_hours | jsonb | no | null | Operating hours (null = 24/7) |
| ev_charger_count | int | no | 0 | EV charging spots in zone |
| status | ZoneStatus | yes | active | Current status |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ParkingSpace
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| zone_id | uuid | yes | — | Zone reference |
| code | text | yes | — | Space code (e.g., "B1-A-023") |
| type | SpaceType | yes | standard | Space type |
| vehicle_type | VehicleType | yes | — | Designed for vehicle type |
| status | SpaceStatus | yes | available | Current status |
| sensor_id | uuid | no | — | Occupancy sensor reference |
| ev_charger_id | uuid | no | — | EV charger reference |
| reserved_for | uuid | no | — | Reserved for user/tenant (monthly) |
| coordinates | jsonb | no | — | Position on floor map {x, y, angle} |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Vehicle
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| owner_id | uuid | no | — | User reference (null for visitors) |
| plate_number | text | yes | — | License plate (e.g., "30A-12345") |
| plate_image_ref | text | no | — | Last captured plate image |
| type | VehicleType | yes | — | Vehicle type |
| brand | text | no | — | Vehicle brand |
| color | text | no | — | Vehicle color |
| registration_status | text | yes | registered | registered / visitor / blacklisted |
| monthly_pass_id | uuid | no | — | Active monthly pass |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ParkingSession
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| vehicle_id | uuid | no | — | Vehicle reference (null if unrecognized) |
| plate_number | text | yes | — | Captured plate number |
| entry_plate_image | text | no | — | Entry LPR image ref |
| exit_plate_image | text | no | — | Exit LPR image ref |
| vehicle_type | VehicleType | yes | — | Detected vehicle type |
| zone_id | uuid | yes | — | Parking zone |
| space_id | uuid | no | — | Assigned space (if tracked) |
| entry_time | timestamptz | yes | — | Entry timestamp |
| exit_time | timestamptz | no | — | Exit timestamp |
| entry_device_id | uuid | yes | — | Entry barrier/camera |
| exit_device_id | uuid | no | — | Exit barrier/camera |
| status | SessionStatus | yes | active | Session status |
| fee_amount | decimal(12,2) | no | — | Calculated fee (VND) |
| fee_currency | text | no | VND | Currency |
| fee_rule_id | uuid | no | — | Applied fee rule |
| payment_status | PaymentStatus | no | — | Payment status |
| payment_method | text | no | — | cash / card / ewallet / monthly_pass |
| payment_ref | text | no | — | External payment reference |
| monthly_pass_id | uuid | no | — | Pass used (if applicable) |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### MonthlyPass
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| user_id | uuid | yes | — | Pass owner |
| vehicle_id | uuid | yes | — | Registered vehicle |
| zone_id | uuid | yes | — | Permitted zone |
| space_id | uuid | no | — | Assigned space (if reserved) |
| pass_type | PassType | yes | — | Pass category |
| valid_from | date | yes | — | Start date |
| valid_until | date | yes | — | End date |
| fee_amount | decimal(12,2) | yes | — | Monthly fee (VND) |
| status | PassStatus | yes | active | Pass status |
| auto_renew | bool | yes | false | Auto-renew on expiry |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### FeeRule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Rule name |
| vehicle_type | VehicleType | yes | — | Applicable vehicle type |
| zone_id | uuid | no | — | Applicable zone (null = all) |
| rate_type | text | yes | — | hourly / daily / flat / tiered |
| rates | jsonb | yes | — | Rate structure (see notes) |
| max_daily | decimal(12,2) | no | — | Daily cap |
| free_minutes | int | no | 0 | Free parking minutes |
| applies_to | text | yes | all | all / visitor / registered |
| priority | int | yes | 0 | Rule priority (higher wins) |
| enabled | bool | yes | true | Active flag |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### EVCharger
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| space_id | uuid | yes | — | Parking space |
| charger_type | text | yes | — | ac_level2 / dc_fast |
| power_kw | decimal(6,2) | yes | — | Charging power |
| connector_type | text | yes | — | type2 / ccs / chademo / gb_t |
| status | ChargerStatus | yes | available | Current status |
| current_session_id | uuid | no | — | Active charging session |
| rate_per_kwh | decimal(8,2) | yes | — | Charging rate (VND/kWh) |
| device_id | uuid | no | — | IoT device reference |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ParkingReservation
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| user_id | uuid | yes | — | Reserver |
| vehicle_id | uuid | no | — | Vehicle (if known) |
| zone_id | uuid | yes | — | Preferred zone |
| space_id | uuid | no | — | Specific space (if assigned) |
| start_time | timestamptz | yes | — | Reservation start |
| end_time | timestamptz | yes | — | Reservation end |
| status | text | yes | confirmed | confirmed / used / expired / cancelled |
| ev_charging | bool | no | false | Needs EV charging |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
ZoneType: underground | surface | multi_story | rooftop
ZoneStatus: active | maintenance | closed
SpaceType: standard | handicap | ev_charging | vip | motorcycle | bicycle
VehicleType: car | motorbike | bicycle | truck
SpaceStatus: available | occupied | reserved | maintenance | blocked
SessionStatus: active | completed | disputed | void
PaymentStatus: pending | paid | waived | refunded
PassType: standard | vip | reserved_space | ev_included
PassStatus: active | expired | suspended | cancelled
ChargerStatus: available | charging | faulted | offline
```

## API Endpoints

### GET /api/v1/parking/zones
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Filter by site |
  | type | ZoneType | — | Filter by zone type |
  | vehicle_type | VehicleType | — | Filter by allowed vehicle |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "name": "Hầm B1",
      "type": "underground",
      "total_spaces": 200,
      "occupied_spaces": 145,
      "available_spaces": 55,
      "occupancy_percent": 72.5,
      "vehicle_types": ["car"],
      "ev_charger_count": 10,
      "ev_chargers_available": 6
    }],
    "total": 4
  }
  ```

### POST /api/v1/parking/zones
- **Auth:** role >= admin
- **Body:** Zone creation payload
- **Response 201:** Created zone

### GET /api/v1/parking/spaces
- **Auth:** role >= viewer
- **Query params:** site_id, zone_id, status, vehicle_type, space_type
- **Response 200:** Space list with current occupancy status

### GET /api/v1/parking/sessions
- **Auth:** role >= operator
- **Query params:** site_id, zone_id, status, plate_number, from, to, vehicle_type
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "plate_number": "30A-12345",
      "vehicle_type": "car",
      "zone": {"id": "uuid", "name": "Hầm B1"},
      "entry_time": "2026-02-19T08:30:00+07:00",
      "exit_time": null,
      "duration_minutes": 125,
      "status": "active",
      "fee_amount": 20000,
      "payment_status": "pending"
    }],
    "total": 145,
    "summary": {
      "active_sessions": 145,
      "today_entries": 230,
      "today_exits": 85,
      "today_revenue": 5600000
    }
  }
  ```

### POST /api/v1/parking/sessions
- **Auth:** system (device-gateway) or role >= operator
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "plate_number": "30A-12345",
    "vehicle_type": "car",
    "zone_id": "uuid",
    "entry_device_id": "uuid",
    "plate_image_ref": "minio://parking/entry/2026-02-19/30A-12345.jpg"
  }
  ```
- **Side effects:** Open barrier, assign space, NATS event, update occupancy, audit log
- **Response 201:** Created session

### PUT /api/v1/parking/sessions/{id}/exit
- **Auth:** system (device-gateway) or role >= operator
- **Body:**
  ```json
  {
    "exit_device_id": "uuid",
    "plate_image_ref": "minio://parking/exit/2026-02-19/30A-12345.jpg"
  }
  ```
- **Side effects:** Calculate fee, open barrier if paid/pass, update space status, audit log
- **Response 200:** Session with calculated fee

### POST /api/v1/parking/sessions/{id}/payment
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "method": "cash",
    "amount": 20000,
    "reference": null
  }
  ```
- **Side effects:** Mark paid, open exit barrier, close session, audit log
- **Response 200:** Updated session

### GET /api/v1/parking/vehicles
- **Auth:** role >= operator
- **Query params:** site_id, plate_number, owner_id, type, registration_status
- **Response 200:** Vehicle list

### POST /api/v1/parking/vehicles
- **Auth:** role >= operator
- **Body:** Vehicle registration payload
- **Response 201:** Created vehicle

### GET /api/v1/parking/passes
- **Auth:** role >= operator
- **Query params:** site_id, user_id, status, zone_id
- **Response 200:** Monthly pass list

### POST /api/v1/parking/passes
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "user_id": "uuid",
    "vehicle_id": "uuid",
    "zone_id": "uuid",
    "space_id": "uuid",
    "pass_type": "reserved_space",
    "valid_from": "2026-03-01",
    "valid_until": "2026-03-31",
    "fee_amount": 2000000,
    "auto_renew": true
  }
  ```
- **Response 201:** Created pass

### GET /api/v1/parking/reservations
- **Auth:** role >= operator
- **Query params:** site_id, user_id, date, status
- **Response 200:** Reservation list

### POST /api/v1/parking/reservations
- **Auth:** role >= operator
- **Body:** Reservation details
- **Response 201:** Created reservation

### GET /api/v1/parking/ev-chargers
- **Auth:** role >= viewer
- **Query params:** site_id, zone_id, status, connector_type
- **Response 200:** Charger list with current status

### POST /api/v1/parking/ev-chargers/{id}/start
- **Auth:** role >= operator or session owner
- **Body:** `{"session_id": "uuid"}`
- **Response 200:** Charging started

### POST /api/v1/parking/ev-chargers/{id}/stop
- **Auth:** role >= operator or session owner
- **Response 200:** Charging stopped with energy consumed and cost

### GET /api/v1/parking/fee-rules
- **Auth:** role >= admin
- **Query params:** site_id, vehicle_type, zone_id
- **Response 200:** Fee rule list

### POST /api/v1/parking/fee-rules
- **Auth:** role >= admin
- **Body:** Fee rule definition
- **Response 201:** Created fee rule

### GET /api/v1/parking/dashboard
- **Auth:** role >= viewer
- **Query params:** site_id
- **Response 200:**
  ```json
  {
    "total_spaces": 500,
    "occupied": 345,
    "available": 155,
    "occupancy_percent": 69.0,
    "zones": [{"name": "Hầm B1", "occupied": 145, "total": 200}],
    "today": {
      "entries": 230,
      "exits": 85,
      "revenue": 5600000,
      "peak_occupancy": 380,
      "peak_time": "10:30"
    },
    "ev_chargers": {"total": 10, "in_use": 4, "available": 6},
    "alerts": [{"type": "zone_almost_full", "zone": "Hầm B1", "occupancy_percent": 92}]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/parking/lpr/{device_id}/read | device→server | 1 | `{"plate":"30A-12345","confidence":0.95,"image_ref":"...","vehicle_type":"car","timestamp":"..."}` | LPR camera plate detection |
| dm3/{site}/parking/barrier/{device_id}/cmd | server→device | 1 | `{"action":"open","session_id":"...","reason":"entry_granted"}` | Barrier open/close command |
| dm3/{site}/parking/barrier/{device_id}/status | device→server | 1 | `{"state":"open","timestamp":"..."}` | Barrier state report |
| dm3/{site}/parking/space/{sensor_id}/status | device→server | 0 | `{"occupied":true,"timestamp":"..."}` | Space occupancy sensor |
| dm3/{site}/parking/ev/{charger_id}/status | device→server | 1 | `{"state":"charging","power_kw":7.2,"energy_kwh":15.3,"timestamp":"..."}` | EV charger status |
| dm3/{site}/parking/ev/{charger_id}/cmd | server→device | 1 | `{"action":"start","max_kwh":50}` | EV charger command |
| dm3/{site}/parking/display/{device_id}/update | server→device | 1 | `{"available_car":55,"available_moto":120,"message":"Còn chỗ"}` | Parking guidance display |

## Business Rules
1. **LPR match threshold:** IF LPR confidence >= 0.85 THEN auto-match vehicle. IF confidence 0.70–0.84 THEN match but flag for review. IF < 0.70 THEN manual entry required.
2. **Registered vehicle auto-entry:** IF vehicle is registered AND has active monthly pass AND zone has available space THEN open barrier automatically within 2 seconds.
3. **Visitor vehicle workflow:** IF plate not recognized THEN capture image, issue temporary ticket (QR/token), barrier opens. On exit, calculate fee based on duration.
4. **Blacklisted vehicle alert:** IF plate matches blacklist THEN do NOT open barrier, alert security guard immediately via push notification and guard station, log event with high priority.
5. **Monthly pass validation:** IF pass is expired THEN treat as visitor (calculate fees). IF pass auto_renew=true AND within 7 days of expiry THEN send renewal reminder notification.
6. **Fee calculation:** IF fee_rule.rate_type = 'tiered' THEN calculate based on tiers (e.g., first 2h: 10,000₫, 2-8h: 5,000₫/h, 8h+: flat 50,000₫/day). Apply free_minutes first. Cap at max_daily.
7. **Zone capacity:** IF zone occupancy >= 95% THEN display "HẾT CHỖ" (FULL) on guidance displays. IF >= 85% THEN display "SẮP HẾT CHỖ" (ALMOST FULL). Prevent entry when 100% full.
8. **Plate mismatch on exit:** IF exit plate != entry plate for session THEN flag session as "disputed", require operator verification before barrier opens.
9. **Overnight parking alert:** IF session duration > 24 hours AND vehicle is not registered with monthly pass THEN alert parking operator and apply overnight surcharge.
10. **EV charging billing:** IF ev_charging session THEN bill parking fee + energy consumed × rate_per_kwh. If charger occupied > 30min after full charge THEN apply idle fee.
11. **Reservation expiry:** IF reservation exists AND vehicle doesn't arrive within 30 minutes of start_time THEN auto-cancel and release space.
12. **Vietnamese plate format validation:** Plates must match Vietnamese format patterns (e.g., 30A-12345, 92B1-123.45 for motorbikes). Non-Vietnamese plates flagged as foreign.
13. **Multi-vehicle per user:** A user may register up to 3 vehicles but only 1 monthly pass per zone unless admin overrides.
14. **Payment required for exit:** IF session has pending fee > 0 AND no monthly pass THEN barrier stays closed until payment confirmed (cash, card, or e-wallet).

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| View sessions | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manual entry/exit | ❌ | ✅ | ✅ | ✅ | ✅ |
| Process payment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Register vehicles | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage passes | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage fee rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage zones/spaces | ❌ | ❌ | ✅ | ✅ | ✅ |
| Override barriers | ❌ | ✅ | ✅ | ✅ | ✅ |
| Void sessions | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage EV chargers | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete zones | ❌ | ❌ | ❌ | ✅ | ✅ |

## Offline Behavior
- **LPR cameras:** Continue capturing plates locally, buffer up to 10,000 events. If no server response within 3 seconds, barrier controller makes local decision based on cached whitelist.
- **Barrier controllers:** Cache registered vehicle plate list (up to 50,000 plates). Make entry/exit decisions locally. Log all transactions in local SQLite, sync when online.
- **Occupancy sensors:** Continue reporting to local gateway. Gateway buffers readings and batch-syncs to server.
- **EV chargers:** Continue charging session autonomously. Buffer energy readings locally. Sync billing data when online.
- **Sync strategy:** On reconnection, barrier controllers upload all buffered sessions. Server reconciles sessions, calculates fees, updates occupancy counts. Resolve duplicate entries by session start time.
- **Conflict resolution:** Server-wins for fee calculations. Local decisions for barrier open/close are final (can't undo a vehicle entry). Disputed sessions flagged for manual review.
- **Local storage:** Barrier controller whitelist: ~5MB for 50K plates. Session buffer: ~10MB for 10K events. TTL: whitelist refreshed daily, sessions synced immediately on reconnect.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /operate/parking | Dashboard | Occupancy overview, zone map, live entry/exit feed, revenue |
| /operate/parking/sessions | Active sessions | DataTable, plate search, filters, payment actions |
| /operate/parking/zones | Zone management | Zone list, space layout editor, occupancy charts |
| /operate/parking/vehicles | Vehicle registry | DataTable, plate search, pass status |
| /operate/parking/passes | Monthly passes | DataTable, issue/renew, expiry alerts |
| /operate/parking/ev-chargers | EV chargers | Charger status, active sessions, billing |
| /operate/parking/fee-rules | Fee configuration | Rule editor, rate calculator, preview |
| /operate/parking/reports | Reports | Revenue, occupancy trends, peak hours |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| parking.session.entry | Vehicle enters | session + plate + image ref | 2 years |
| parking.session.exit | Vehicle exits | session + plate + fee | 2 years |
| parking.session.payment | Payment processed | session_id + amount + method | permanent |
| parking.session.voided | Session voided | session_id + actor + reason | permanent |
| parking.session.disputed | Plate mismatch | session_id + entry/exit plates | 1 year |
| parking.barrier.opened | Barrier opened | device_id + reason + session_id | 1 year |
| parking.barrier.override | Manual override | device_id + actor + reason | permanent |
| parking.vehicle.registered | Vehicle registered | vehicle + owner | 1 year |
| parking.vehicle.blacklisted | Added to blacklist | vehicle_id + actor + reason | permanent |
| parking.pass.created | Pass issued | full pass | 1 year |
| parking.pass.expired | Pass expired | pass_id + vehicle_id | 1 year |
| parking.ev.charge_start | Charging started | charger_id + session_id | 1 year |
| parking.ev.charge_stop | Charging stopped | charger_id + energy_kwh + cost | 1 year |
| parking.zone.full | Zone reached 100% | zone_id + timestamp | 90 days |

## Integration Points
- **Depends on:** identity-svc (vehicle owner lookup), vision-svc (LPR processing), device-gw (barrier/camera control), notif-svc (alerts, pass expiry), tenant-svc (site/zone hierarchy), auth-svc (JWT)
- **Consumed by:** analytics/report-svc (parking revenue, occupancy trends), automate-svc (parking triggers), ai-asst-svc (parking queries), access-svc (parking as access point)
- **External:** Payment gateways (MoMo, VNPay, ZaloPay), LPR camera hardware (Hikvision, Dahua), barrier controllers (RS-485), EV charger protocols (OCPP 1.6/2.0)

## Notes
- Vietnamese parking context: motorbikes are the majority vehicle type (~70% in most buildings). Fee structures differ significantly between cars and motorbikes.
- LPR handles both Vietnamese car plates (XX[A-Z]-XXXXX) and motorbike plates (XX[A-Z]X-XXX.XX)
- Fee amounts in VND — no decimal precision needed in practice (round to nearest 1,000₫)
- OCPP integration for EV chargers enables compatibility with major charger brands
- Consider QR-based payment for visitor parking in Phase 2
- Parking guidance system with LED indicators per space in Phase 3
