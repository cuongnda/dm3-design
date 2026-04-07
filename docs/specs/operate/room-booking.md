# Feature: Room & Resource Booking

> Domain: OPERATE | Color: #4CAF50 | Priority: P1
> Status: Draft | Owner: facility-svc team

## Overview
Room & Resource Booking enables tenants and employees to reserve meeting rooms, hot desks, equipment, and shared amenities through a calendar-based interface. Integrates with access control to auto-grant door access for the booking period, and with IoT sensors to detect no-shows and auto-release resources. Supports recurring bookings, multi-timezone calendar sync (Outlook/Google), and Vietnamese holiday awareness.

## Data Models

### Resource
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Display name (e.g., "Phòng họp Lotus") |
| type | ResourceType | yes | — | Resource category |
| floor_id | uuid | no | — | Floor/zone reference |
| capacity | int | no | — | Max occupancy (rooms/desks) |
| amenities | jsonb | no | {} | Available equipment {"projector": true, "whiteboard": true} |
| photo_refs | text[] | no | — | MinIO object references |
| status | ResourceStatus | yes | active | Current status |
| booking_rules | jsonb | yes | {} | Per-resource rules (see below) |
| check_in_required | bool | yes | false | Require check-in confirmation |
| check_in_window_min | int | yes | 15 | Minutes before start to allow check-in |
| no_show_release_min | int | yes | 15 | Minutes after start to auto-release |
| min_booking_min | int | yes | 30 | Minimum booking duration |
| max_booking_min | int | yes | 480 | Maximum booking duration |
| advance_booking_days | int | yes | 30 | How far ahead bookings allowed |
| buffer_min | int | yes | 0 | Buffer between consecutive bookings |
| access_door_ids | uuid[] | no | — | Doors to auto-unlock during booking |
| sensor_id | uuid | no | — | Occupancy sensor for no-show detection |
| display_device_id | uuid | no | — | Door-mounted status display |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Booking
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| resource_id | uuid | yes | — | Resource being booked |
| organizer_id | uuid | yes | — | User who made the booking |
| title | text | yes | — | Meeting/booking title |
| description | text | no | — | Details or agenda |
| start_time | timestamptz | yes | — | Booking start |
| end_time | timestamptz | yes | — | Booking end |
| status | BookingStatus | yes | confirmed | Current status |
| recurrence_rule | text | no | — | iCal RRULE for recurring bookings |
| recurrence_group_id | uuid | no | — | Groups recurring instances |
| attendees | uuid[] | no | — | Invited user IDs |
| external_attendees | jsonb | no | [] | External email invitees |
| checked_in | bool | yes | false | Whether organizer checked in |
| checked_in_at | timestamptz | no | — | Check-in timestamp |
| checked_in_by | uuid | no | — | Who checked in |
| released_reason | text | no | — | Why booking was released (no_show, cancelled, etc.) |
| calendar_sync_id | text | no | — | External calendar event ID |
| calendar_provider | text | no | — | outlook / google |
| access_rule_id | uuid | no | — | Temporary access rule created |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### RecurringException
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| recurrence_group_id | uuid | yes | — | Parent recurring group |
| original_start | timestamptz | yes | — | Original occurrence date |
| action | text | yes | — | 'skip' or 'modify' |
| modified_booking | jsonb | no | — | Modified fields if action=modify |

### Enums
```
ResourceType: meeting_room | training_room | hot_desk | phone_booth | equipment | vehicle | amenity
ResourceStatus: active | maintenance | decommissioned
BookingStatus: tentative | confirmed | checked_in | completed | cancelled | no_show | released
```

## API Endpoints

### GET /api/v1/bookings/resources
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | type | ResourceType | — | Filter by resource type |
  | floor_id | uuid | — | Filter by floor |
  | capacity_min | int | — | Minimum capacity |
  | amenities | text[] | — | Required amenities |
  | available_from | timestamptz | — | Check availability from |
  | available_to | timestamptz | — | Check availability to |
  | status | ResourceStatus | active | Filter by status |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "name": "Phòng họp Lotus",
      "type": "meeting_room",
      "capacity": 12,
      "floor": {"id": "uuid", "name": "Tầng 5"},
      "amenities": {"projector": true, "whiteboard": true, "video_conf": true},
      "status": "active",
      "is_available": true,
      "next_available_slot": "2026-02-19T10:00:00+07:00"
    }],
    "total": 15,
    "page": 1,
    "limit": 20
  }
  ```
- **Errors:** 401, 403, 422

### POST /api/v1/bookings/resources
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "name": "Phòng họp Lotus",
    "type": "meeting_room",
    "floor_id": "uuid",
    "capacity": 12,
    "amenities": {"projector": true, "whiteboard": true},
    "check_in_required": true,
    "no_show_release_min": 15,
    "access_door_ids": ["uuid"],
    "sensor_id": "uuid"
  }
  ```
- **Side effects:** audit log, MQTT publish to display device
- **Response 201:** Created resource

### GET /api/v1/bookings/resources/{id}
- **Auth:** role >= viewer
- **Response 200:** Full resource detail with current/upcoming bookings

### PUT /api/v1/bookings/resources/{id}
- **Auth:** role >= admin
- **Body:** Partial resource update
- **Side effects:** audit log, notify affected bookings if rules changed
- **Response 200:** Updated resource

### DELETE /api/v1/bookings/resources/{id}
- **Auth:** role >= site_admin
- **Side effects:** Cancel all future bookings, notify organizers, audit log
- **Response 204:** No content

### GET /api/v1/bookings/reservations
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | resource_id | uuid | — | Filter by resource |
  | organizer_id | uuid | — | Filter by organizer |
  | status | BookingStatus | — | Filter by status |
  | from | timestamptz | — | Start of date range |
  | to | timestamptz | — | End of date range |
  | my_bookings | bool | false | Only my bookings |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "resource": {"id": "uuid", "name": "Phòng họp Lotus", "type": "meeting_room"},
      "organizer": {"id": "uuid", "name": "Nguyễn Văn A"},
      "title": "Sprint Planning",
      "start_time": "2026-02-19T09:00:00+07:00",
      "end_time": "2026-02-19T10:00:00+07:00",
      "status": "confirmed",
      "checked_in": false,
      "attendees_count": 5
    }],
    "total": 42,
    "page": 1,
    "limit": 20
  }
  ```

### POST /api/v1/bookings/reservations
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "resource_id": "uuid",
    "title": "Sprint Planning",
    "description": "Bi-weekly sprint planning meeting",
    "start_time": "2026-02-19T09:00:00+07:00",
    "end_time": "2026-02-19T10:00:00+07:00",
    "attendees": ["uuid1", "uuid2"],
    "external_attendees": [{"email": "guest@company.com", "name": "Guest"}],
    "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO;COUNT=10",
    "calendar_sync": true
  }
  ```
- **Validation:** Check conflicts, capacity, booking rules, advance booking limit
- **Side effects:** 
  - Create temporary access rule for organizer + attendees
  - Sync to external calendar (Outlook/Google)
  - Notify attendees via notif-svc
  - Update display device via MQTT
  - Audit log
- **Response 201:** Created booking (or array for recurring)
- **Errors:** 409 (conflict), 422 (validation)

### GET /api/v1/bookings/reservations/{id}
- **Auth:** role >= viewer
- **Response 200:** Full booking detail with attendees, access rule, check-in status

### PUT /api/v1/bookings/reservations/{id}
- **Auth:** organizer or role >= admin
- **Body:** Partial booking update
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | apply_to | text | single | 'single', 'this_and_future', 'all' (for recurring) |
- **Side effects:** Update access rules, calendar sync, notify attendees
- **Response 200:** Updated booking

### DELETE /api/v1/bookings/reservations/{id}
- **Auth:** organizer or role >= admin
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | apply_to | text | single | 'single', 'this_and_future', 'all' (for recurring) |
- **Side effects:** Remove access rules, cancel calendar event, notify, audit log
- **Response 204:** No content

### POST /api/v1/bookings/reservations/{id}/check-in
- **Auth:** organizer or attendee
- **Body:**
  ```json
  {
    "method": "qr_scan"
  }
  ```
- **Validation:** Within check-in window, booking is confirmed
- **Side effects:** Update status to checked_in, audit log, update display
- **Response 200:** Updated booking with check-in timestamp

### GET /api/v1/bookings/calendar
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Filter by site |
  | resource_ids | uuid[] | — | Filter by resources |
  | from | timestamptz | required | Calendar start |
  | to | timestamptz | required | Calendar end |
  | view | text | week | 'day', 'week', 'month' |
- **Response 200:**
  ```json
  {
    "resources": [{
      "id": "uuid",
      "name": "Phòng họp Lotus",
      "bookings": [{
        "id": "uuid",
        "title": "Sprint Planning",
        "start_time": "...",
        "end_time": "...",
        "status": "confirmed",
        "organizer_name": "Nguyễn Văn A"
      }]
    }]
  }
  ```

### GET /api/v1/bookings/availability
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Filter by site |
  | resource_id | uuid | required | Resource to check |
  | date | date | required | Date to check |
  | duration_min | int | 60 | Desired booking duration |
- **Response 200:**
  ```json
  {
    "resource_id": "uuid",
    "date": "2026-02-19",
    "available_slots": [
      {"start": "08:00", "end": "09:00"},
      {"start": "11:00", "end": "12:00"},
      {"start": "14:00", "end": "17:00"}
    ]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/booking/resource/{id}/status | server→device | 1 | `{"status":"occupied","booking":{"title":"...","end_time":"...","organizer":"..."}}` | Push current status to room display |
| dm3/{site}/booking/resource/{id}/next | server→device | 1 | `{"next_booking":{"title":"...","start_time":"..."},"available_until":"..."}` | Next booking info for display |
| dm3/{site}/iot/sensor/{id}/occupancy | device→server | 1 | `{"occupied":true,"count":3,"timestamp":"..."}` | Occupancy sensor reading for no-show detection |
| dm3/{site}/booking/checkin/{resource_id} | device→server | 1 | `{"method":"nfc","user_id":"...","timestamp":"..."}` | Check-in from room panel |

## Business Rules
1. **No double-booking:** IF a resource has a confirmed booking for a time slot THEN no other confirmed booking can overlap that slot (409 Conflict).
2. **Advance booking limit:** IF booking start_time > now() + resource.advance_booking_days THEN reject with "Booking too far in advance".
3. **Duration constraints:** IF booking duration < resource.min_booking_min OR > resource.max_booking_min THEN reject.
4. **Buffer enforcement:** IF resource.buffer_min > 0 THEN ensure buffer gap between consecutive bookings (no booking may start within buffer_min of previous booking's end).
5. **Check-in window:** IF resource.check_in_required THEN organizer must check in within [start_time - check_in_window_min, start_time + no_show_release_min]. IF not checked in, status → no_show and booking is released.
6. **No-show auto-release:** IF check_in_required AND no check-in within no_show_release_min after start THEN auto-cancel booking, remove access rules, send notification to organizer, update display to "Available".
7. **Sensor-based no-show:** IF check_in_required AND occupancy sensor reports empty for 10 consecutive minutes after start THEN mark as no_show regardless of check-in status.
8. **Recurring conflict detection:** IF creating recurring booking THEN check ALL occurrences for conflicts. Return list of conflicting dates. Allow partial creation (skip conflicts) if organizer confirms.
9. **Access auto-provisioning:** IF resource.access_door_ids is set THEN on booking confirmation, create temporary access rule in access-svc for organizer + attendees, valid from start_time - 10min to end_time + 5min.
10. **Calendar sync bidirectional:** IF booking created/modified in DM3 THEN push to external calendar. IF external calendar event modified/deleted THEN sync back to DM3 (webhook from calendar provider).
11. **Vietnamese holidays:** IF booking falls on Vietnamese public holiday (Tết, 30/4, 1/5, 2/9, etc.) THEN show warning but allow booking.
12. **Capacity enforcement:** IF attendees count > resource.capacity THEN reject with "Exceeds room capacity".
13. **Organizer cancellation policy:** IF booking starts within 30 minutes THEN cancellation requires admin approval (prevents last-minute releases that waste time).
14. **Working hours preference:** Resources may define working_hours in booking_rules. Bookings outside working hours allowed but flagged as "after-hours" and may require approval.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List resources | ✅ | ✅ | ✅ | ✅ | ✅ |
| View calendar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create booking | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create booking for others | ❌ | ❌ | ✅ | ✅ | ✅ |
| Update own booking | ❌ | ✅ | ✅ | ✅ | ✅ |
| Update any booking | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cancel own booking | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cancel any booking | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage resources | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete resources | ❌ | ❌ | ❌ | ✅ | ✅ |
| View all bookings | ❌ | ✅ | ✅ | ✅ | ✅ |
| Configure booking rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Override no-show release | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior
- **Device-side (room displays):** Display panels cache current and next 5 bookings locally. Continue showing status even if server connection lost. Show "Offline — last updated: {time}" indicator. Allow NFC check-in via local buffer (synced when online).
- **Mobile app:** Cache user's upcoming bookings (next 7 days) locally. Allow viewing cached bookings offline. New bookings queued locally and submitted when online. Check-in via QR code cached offline and synced.
- **Sync strategy:** On reconnection, room displays fetch full day's schedule. Mobile app syncs queued bookings with conflict resolution. Display devices use MQTT retained messages for last-known state.
- **Conflict resolution:** Server-wins for booking conflicts (first-to-sync wins). If offline booking conflicts with one created while offline, notify user and auto-cancel the later one.
- **Local storage:** Room displays: 24h of bookings, ~50KB. Mobile: 7 days of user bookings, ~200KB. TTL: refresh every 5 minutes when online.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /operate/bookings | Calendar view | WeekView, DayView, resource sidebar, quick-book |
| /operate/bookings/resources | Resource list | DataTable, filters (type, floor, capacity), stat cards |
| /operate/bookings/resources/:id | Resource detail | Tabs (info, bookings, settings), calendar, utilization chart |
| /operate/bookings/reservations/:id | Booking detail | Attendees, check-in status, access rule, timeline |
| /operate/bookings/new | New booking | Resource picker, time selector, attendees, recurrence |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| booking.resource.created | POST resource | full resource | 1 year |
| booking.resource.updated | PUT resource | diff only | 1 year |
| booking.resource.deleted | DELETE resource | id + actor | permanent |
| booking.reservation.created | POST reservation | full booking | 1 year |
| booking.reservation.updated | PUT reservation | diff only | 1 year |
| booking.reservation.cancelled | DELETE reservation | id + actor + reason | 1 year |
| booking.reservation.checked_in | POST check-in | booking_id + method + actor | 1 year |
| booking.reservation.no_show | Auto-release timer | booking_id + resource_id | 1 year |
| booking.reservation.released | Auto or manual | booking_id + reason | 1 year |
| booking.access.provisioned | Booking confirmed | booking_id + access_rule_id + users | 1 year |
| booking.access.revoked | Booking ended/cancelled | booking_id + access_rule_id | 1 year |

## Integration Points
- **Depends on:** identity-svc (user lookup, attendees), access-svc (temporary access rules), iot-svc (occupancy sensors), notif-svc (booking notifications), tenant-svc (site hierarchy), auth-svc (JWT validation)
- **Consumed by:** analytics/report-svc (room utilization metrics), automate-svc (booking triggers), ai-asst-svc (natural language booking queries), display devices (MQTT)
- **External:** Microsoft Outlook (Graph API calendar sync), Google Calendar (Calendar API sync), room display panels (MQTT)

## Notes
- Calendar sync uses OAuth2 service account for Outlook/Google — configured per tenant
- RRULE parsing follows RFC 5545 for recurring bookings
- Room displays use e-ink or LCD panels connected via MQTT — show red/green status, current meeting, next meeting
- Vietnamese context: resource names support Vietnamese characters, holiday calendar includes Vietnamese public holidays
- Consider peak hour pricing for premium resources in future phases
- Hot desk booking supports floor map view with drag-to-book in Phase 2
