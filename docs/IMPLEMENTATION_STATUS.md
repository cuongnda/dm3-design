# Implementation Status

This document tracks the current implementation status of DM3 features. Updated: 2026-04-12 (parking ↔ access integration: unified vehicle registry, zone hierarchy soft-FK, NATS event bridge, barrier auto-registration, opt-in access policy check).

---

## ⚠️ Critical Findings

> **Two systemic gaps found that cannot be buried in per-item detail:**
>
> 1. **Service topology is ~35% implemented.** The architecture doc (`docs/architecture/system-architecture.md:281`) specifies ~20 microservices. 7 exist in `backend/cmd/` (auth-svc, access-svc, identity-svc, device-gateway, audit-svc, visitor-svc on port 8006, parking-svc on port 8007). Remaining domain services (booking-svc, guard-tour-svc, analytics-svc, etc.) are absent.
>
> 2. **The majority of frontend pages are mock-data-only UI shells.** 21 of ~30 feature pages import from `mock-data` files or define inline hardcoded arrays with zero API client usage. ALL OPERATE, ALL SMART, and most SECURE/MANAGE pages are visual prototypes, not working features. Only DashboardPage, DeviceDetailPage, IdentitiesPage/PersonDetailPage/GroupsPage, and SystemSettingsPage integrate with real backend APIs.
>
> **Action required:** These findings should be reviewed by the team before treating the per-item compliance table below as a routine status update.

---

## Architecture Compliance Summary

| Layer | Status | Details |
|-------|--------|---------|
| Service Topology | ❌ Gap | 7 of ~20 specified services implemented. Evidence: `backend/cmd/` has 7 dirs (auth-svc, identity-svc, access-svc, device-gateway, audit-svc, visitor-svc on port 8006, parking-svc on port 8007); `docs/architecture/system-architecture.md:281` specifies ~20 |
| Data Flow / MQTT Pipeline | ✅ Compliant | Topic `dm/{tid}/device/{did}/{cat}` confirmed. Envelope (v, id, ts) confirmed. NATS bridge confirmed. Evidence: `backend/internal/gateway/mqtt_handler.go:48-57, 27-35` |
| Data Model / ER | ⚠️ Partial | Core access hierarchy implemented (`dm3_access`). Visitor module isolated into own schema: `dm3_visitor` (11 tables). Parking module isolated into own schema: `dm3_parking` (7 tables: parking_lots, parking_zones, parking_vehicles, parking_fee_rules, parking_passes, parking_sessions, parking_settings). **Vehicle registry unified into `dm3_parking.parking_vehicles`** (migration 000010 dropped `dm3_identity.vehicles`; parking_vehicles now owns triple credentials: plate + RFID + NFC + visitor_id link). `parking_zones.access_zone_id` soft-FK into `dm3_access.zones` (migration 000010). `dm3_access.access_devices` +`source`/`source_ref` for auto-registered barriers (migration 000011). `parking_settings.enforce_access_rules` opt-in cross-module policy check (migration 000012). `dm3_audit` schema active (audit_logs hypertable). Remaining gaps: contractors, rooms, maintenance, keys. See `docs/architecture/module-isolation.md`. |
| Security | ⚠️ Partial | JWT auth, bcrypt, CORS, refresh-token replay detection confirmed. Missing: TLS config in docker-compose for EMQX, no rate limiting middleware found. |
| Deployment | ✅ Compliant | All 6 infra services present in `backend/docker-compose.yml` with correct ports. Simulator is in a separate `simulator/docker-compose.yml` (minor split). No Traefik gateway config found. |

---

## ✅ Implemented (Compliance-Audited)

### Backend Services (Go)

- **auth-svc** (`backend/internal/authsvc/`) — JWT auth, bcrypt, refresh tokens, RBAC, two-step company login
  - Status: ✅ Compliant (v1) | Risk: Low
  - Evidence: `handlers.go:824-840` — `generateAccessToken` emits sub, cid, email, name, role, exp, iat (15min TTL ✅); `handlers.go:565-590` — DeviceClaims with sub, cid, did, dtype, permissions (24h ✅); `handlers.go:366-372` — refresh token rotation + replay detection ✅; bcrypt confirmed at `handlers.go:166, 662, 767`
  - Deviation: `GET /api/v1/roles` returns generic `admin/operator/viewer` (handlers.go:797-800) but spec defines 5 roles: `system_admin, primary_manager, manager, operator, viewer`. Roles endpoint is stale.

- **access-svc** (`backend/internal/access/`) — Access Group management, access point management, spatial zones, managed zone maps, access rule sync, event processing
  - Status: ✅ Compliant for current access scope | Risk: Low
  - Evidence: `backend/pkg/db/migrations/000001_initial.up.sql` + `000009_zone_spatial_ap_placement.up.sql` — `dm3_access.access_points`, `dm3_access.zones`, `dm3_access.access_groups`, `dm3_access.access_group_access_points`, `dm3_access.access_group_users` (with `effective_from`/`effective_to`), `dm3_access.access_times`, `dm3_access.access_time_slots`, `dm3_access.access_events` (hypertable) confirmed; `zone_handlers.go` implements zone CRUD, `GET/PUT /zones/{id}/map`, `POST /zones/{id}/map/upload`, and managed asset serving; NATS consumer in `nats_consumer.go`; `cfg.access_rules` MQTT sync dispatched on AG/AP/user mutations
  - Implemented: Access Groups CRUD ✅ | AG↔AP assignment ✅ | AG↔User assignment with temporal membership ✅ | Access Time management ✅ | Access rule sync to devices via MQTT ✅ | Spatial zone hierarchy ✅ | Zone-owned indoor map upload + serving ✅ | Zone detail list/map workflows reflected in console ✅ | Passage Time field on access_points (DB) ✅
  - Deviation: Passage Time (`access_time_id` on access_points) is stored in DB but not yet exposed in the Access Point UI. Broader site modeling beyond the current zone hierarchy still needs separate verification if reintroduced.

- **identity-svc** (`backend/internal/identity/`) — User/credential management, identity operations
  - Status: ✅ Compliant | Risk: Low
  - Evidence: Migration confirms `dm3_identity.users`, `dm3_identity.credentials`, `dm3_identity.user_groups`, `dm3_identity.departments` ✅
  - Implemented: User CRUD ✅ | Credentials ✅ | Groups ✅ | Departments ✅
  - Deviation: No `contractors`, `rooms`, or `maintenance` tables. These features are mock-UI only. Vehicle registry was relocated to `dm3_parking.parking_vehicles` (migration 000010) for unified triple-credential support.

- **visitor-svc** (`backend/cmd/visitor-svc/`, `backend/internal/visitor/`) — Standalone visitor management service (port 8006)
  - Status: ✅ Compliant (v2, module isolation) | Risk: Low
  - Evidence: `backend/cmd/visitor-svc/main.go` — standalone service with PostgreSQL, NATS streaming, i18n, audit logging, health checks, graceful shutdown. Migration 000005 (dm3_visitor schema) + 000006 (temp_credentials) confirmed.
  - **Schema isolation**: All visitor tables moved from `dm3_identity` to own `dm3_visitor` schema (independently deployable). See `docs/architecture/module-isolation.md`.
  - DB tables (dm3_visitor schema — migration 000005): `visitors`, `visits`, `visitor_badges`, `watchlist`, `visitor_settings`, `visit_groups`, `visitor_access_log`, `recurring_visit_templates`, `visitor_agreements`, `visitor_agreement_signatures`
  - DB tables (migration 000006): `temp_credentials` — automatically created on visit approval via `visit.approved` NATS event; revoked on checkout/cancellation via `visit.ended` event
  - visits table v2 columns: `group_id`, `recurring_template_id`, `cancelled_reason`, `rejection_reason`, `approved_by`, `checkout_reason`, `reinvite_count`
  - **Event-driven architecture**: publishes `visit.approved`, `visit.checkedin`, `visit.checkedout`, `visit.cancelled` events; subscribes to `identity.user.updated`, `access.zone.updated` for local cache invalidation
  - **Credential integration**: `visit.approved` → access-svc creates temp credential in `dm3_visitor.temp_credentials`; `visit.ended` → access-svc revokes credential
  - **Feature flag**: per-tenant `enabled_plugins` toggle in tenant settings; visitor plugin disabled by default until explicitly enabled
  - Implemented: Visitor CRUD ✅ | Visit scheduling & check-in/out ✅ | Walk-in registration ✅ | Watchlist management ✅ | QR code check-in ✅ | Badge printing ✅ | Auto-checkout cron ✅ | Visit Groups (batch/conference) ✅ | Recurring visit templates ✅ | Visitor access log ✅ | Visitor agreements & signatures ✅ | Analytics (top visitors, stats) ✅ | Per-tenant settings ✅ | Evacuation list ✅ | Reinvite flow ✅ | Temp credential lifecycle ✅
  - API: 40+ endpoints under `/api/v1/visitors/` — visits CRUD, lifecycle (approve/checkin/checkout/reinvite), walk-in, batch, groups, watchlist, agreements, analytics, recurring, settings, access-log, evacuation, QR lookup
  - Frontend: `apps/console/src/features/visitors/` (8 pages) + `apps/console/src/features/manage/visitors/` (main VisitorsPage with hooks). Lazy-loaded behind `PluginGuard` component (feature flag check). API client: `packages/api-client/src/visitors.ts` (35+ functions)

- **device-gateway** (`backend/internal/gateway/`) — MQTT bridge, device provisioning, sync coordination, WebSocket events, managed firmware storage
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `mqtt_handler.go:47-57` — topic `dm/{cid}/device/{did}/{category}` parsed correctly; `mqtt_handler.go:27-35` — MQTTEnvelope (v, id, ts) ✅; `mqtt_handler.go:119` — NATS bridge publishes to `dm3.devices.{tenantID}.{deviceID}.{category}` ✅; provisioning tables confirmed in migration (provisioning_tokens, pending_registrations, used_nonces); service boots the shared objectstore and uses it for firmware binaries

- **audit-svc** (`backend/internal/auditsvc/`) — Standalone audit trail service, NATS consumer, query API
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `cmd/audit-svc/main.go` — standalone service on port 8001; `internal/auditsvc/consumer.go` — NATS JetStream consumer with batch INSERT (50 entries / 100ms flush) to `dm3_audit.audit_logs` hypertable; `internal/auditsvc/handlers.go` — query API with pagination, filtering, CSV export, stats; all 4 other services publish audit events via `pkg/audit.Logger` → NATS `dm3.audit.>` subjects
  - Architecture: Events published asynchronously from all services via buffered channel → NATS JetStream → audit-svc consumer → TimescaleDB. Table is INSERT+SELECT only (tamper-proof). 2-year retention, 30-day compression.

### Frontend Features (React/TypeScript)

#### PLATFORM

- **Dashboard** (`DashboardPage`)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `apps/console/src/features/dashboard/DashboardPage.tsx` — uses `useQuery` and real API client for live event feed and device status

- **Devices** (`DevicesPage`, `DeviceDetailPage`, `DoorDetailPage`)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `apps/console/src/features/devices/DeviceDetailPage.tsx` — imports from `@dm3/api-client`, real API calls confirmed

- **System** (`SystemDevicesPage`, `SystemSettingsPage`)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `apps/console/src/features/system/SystemSettingsPage.tsx` — uses `useQuery`, real API calls confirmed

- **Company Management** (`CompanyListPage`, `CompanyDetailPage`, `CreateCompanyPage`)
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: Files exist in `apps/console/src/features/system/`; company CRUD backed by `auth-svc` `/api/v1/system/companies` endpoints (confirmed in `company_handlers.go`)
  - Deviation: CompanyDetailPage/CreateCompanyPage not found in real-API scan — likely use direct fetch patterns not matching the search; requires deeper verification. Company lifecycle states (suspend/deactivate) not verified in UI.

- **Settings** (`SettingsPage`)
  - Status: ⚠️ Partial | Risk: Low
  - Evidence: File exists. Not in real-API scan — may use local state only.
  - Deviation: Spec requires locale/timezone update which is in `auth-svc` (`handlers.go:506-511`). UI connection not confirmed.

- **Alerts** (`AlertsPage`)
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: File exists. Not in real-API scan.
  - Deviation: No alerts backend table or service found in migration or `backend/cmd/`. Alerts likely mock-data only.

- **Device Provisioning** (`ProvisionDevicePage`, `PendingDevicesPage`)
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: `apps/console/src/features/manage/provisioning/ProvisioningPage.tsx` — imports mock-data; backend provisioning flow is fully implemented (`gateway/provisioning.go`, migration tables confirmed)
  - Deviation: Frontend is mock-data shell despite backend being fully compliant. Gap is in the UI layer only.

#### SECURE Domain

- **Access Control / Access Groups** (`AccessControlPage`, `AccessGroupsPage`)
  - Status: ✅ Real (backend + frontend working) | Risk: Low
  - Evidence: Access Groups CRUD backed by `access-svc` AG endpoints; AG↔AP assignment via `/api/v1/access/access-groups/{id}/access-points`; AG↔User assignment with `effective_from`/`effective_to` via `/api/v1/access/access-groups/{id}/users`; Access Time management via `/api/v1/access/access-times`; `cfg.access_rules` MQTT sync dispatched on mutations
  - Implemented: Access Groups CRUD ✅ | AG↔AP assignment ✅ | AG↔User assignment with temporal membership ✅ | Access Time management ✅ | Access rule sync to devices via MQTT ✅
  - Partial: Passage Time on Access Points stored in DB but not yet exposed in the AP UI (field present, UI control pending)

- **AI Detection** (`AIDetectionPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/secure/ai-detection/AIDetectionPage.tsx` — imports from `./mock-data`
  - Deviation: No AI detection backend service or spec-matching API endpoint found. Both frontend and backend are incomplete.

- **CCTV** (`CCTVPage`, `CameraDetailPage`)
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: `CCTVPage.tsx` — has both `useQuery` (partial real API) and mock-data imports; `CameraDetailPage.tsx` — mock-data only
  - Deviation: Camera playback and live stream endpoints not confirmed in any backend service.

- **Emergency** (`EmergencyPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: High
  - Evidence: `apps/console/src/features/secure/emergency/EmergencyPage.tsx` — imports mock-data
  - Deviation: No emergency backend service or endpoint found. High risk as emergency response is safety-critical.

- **Intercom** (`IntercomPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/secure/intercom/IntercomPage.tsx` — imports mock-data
  - Deviation: No intercom backend service or WebRTC signaling endpoint found.

- **Intrusion** (`IntrusionPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: High
  - Evidence: `apps/console/src/features/secure/intrusion/IntrusionPage.tsx` — imports mock-data
  - Deviation: No intrusion detection backend service found. MQTT `alarm.triggered` event is received at gateway but not persisted or routed to a dedicated service.

#### MANAGE Domain

- **Identity Management** (`IdentitiesPage`, `PersonDetailPage`, `GroupsPage`)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `PersonDetailPage.tsx:11-12` — uses `usePerson`, `useCredentials`, `useCreateCredential`, `useDeleteCredential`, `useUploadPhoto`, `useEvents` (real API hooks); `IdentitiesPage.tsx` and `GroupsPage.tsx` confirmed to exist in `manage/identities/` with real hook usage
  - Deviation: None significant at UI level. Backend identity tables confirmed in migration.

- **Visitor Management** (`VisitorsPage` + 8 sub-pages)
  - Status: ✅ Real (backend v2 + frontend working) | Risk: Low
  - Evidence: `backend/internal/visitor/` — 16 handler files; `backend/cmd/visitor-svc/main.go` — standalone service; `packages/api-client/src/visitors.ts` — 35+ API functions; `apps/console/src/features/manage/visitors/` + `apps/console/src/features/visitors/` — real API hooks
  - Implemented (v1): Visitor CRUD ✅ | Visit scheduling & check-in/out ✅ | Walk-in registration ✅ | Watchlist management ✅ | QR code check-in ✅ | Badge printing ✅ | Auto-checkout cron ✅
  - Implemented (v2 — migration 003): Visit Groups (batch/conference) ✅ | Recurring visit templates ✅ | Visitor access log ✅ | Visitor agreements & NDA signatures ✅ | Per-tenant visitor settings ✅ | Analytics (top visitors, stats) ✅ | Evacuation list ✅ | Reinvite flow ✅ | Batch create ✅
  - DB tables (dm3_visitor schema — 11 tables): `visitors`, `visits`, `visitor_badges`, `watchlist`, `visitor_settings`, `visit_groups`, `visitor_access_log`, `recurring_visit_templates`, `visitor_agreements`, `visitor_agreement_signatures`, `temp_credentials`
  - Frontend pages: VisitorsPage, VisitorSettingsPage, VisitorWatchlistPage, VisitorGroupsPage, VisitorAccessHistoryPage, VisitorAnalyticsPage, VisitorPreRegisterPage, VisitorAgreementsPage, VisitorRecurringPage

- **Contractor Management** (`ContractorsPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/manage/contractors/ContractorsPage.tsx` — imports mock-data
  - Deviation: No `contractors` table in migration. Both frontend and backend incomplete.

- **Attendance** (`AttendancePage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/manage/attendance/AttendancePage.tsx` — imports mock-data
  - Deviation: No attendance table or backend service found.

- **Delivery Management** (`DeliveriesPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Low
  - Evidence: `apps/console/src/features/manage/deliveries/DeliveriesPage.tsx` — imports mock-data
  - Deviation: No deliveries table or backend service found.

- **Access Provisioning** (`ProvisioningPage`)
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: `ProvisioningPage.tsx` — imports mock-data for device provisioning flow; backend provisioning flow is fully implemented (`gateway/provisioning.go`)
  - Deviation: Frontend device provisioning UI is a mock-data shell. Access Group-based rule provisioning is handled via the Access Groups UI (see above), not this page.

#### OPERATE Domain — ⚠️ MOST FRONTEND PAGES ARE MOCK-DATA SHELLS (parking has full backend)

- **Room Booking** (`RoomBookingPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/operate/room-booking/RoomBookingPage.tsx` — imports mock-data; no rooms table in migration
  - Deviation: No backend implementation. Frontend and backend both incomplete.

- **Parking** (`ParkingPage`)
  - Status: ⚠️ Partial (full backend + access integration + plugin gating, frontend still mock-only) | Risk: Low
  - Backend: Standalone `parking-svc` on port 8007 with 19 API endpoints. Isolated `dm3_parking` schema (migration 000008). Models, handlers, helpers, events in `backend/internal/parking/`. NATS stream `PARKING` for events. Plugin-gated via `RequirePlugin("parking")`. Unit + integration tests in `backend/internal/parking/*_test.go`. Seed data in `backend/scripts/seed_parking.sql`.
  - **Parking ↔ Access integration** (migrations 000010–000012, 2026-04-12):
    - **Phase 1 — Unified vehicle registry**: `dm3_identity.vehicles` dropped; `dm3_parking.parking_vehicles` owns plate + RFID + NFC + visitor_id link. CHECK constraint enforces single owner (user XOR visitor).
    - **Phase 2 — Triple credential resolution**: entry/exit handlers resolve vehicle by NFC > RFID > plate (with recognition_confidence recorded, `matched_by` populated).
    - **Phase 3 — NATS event bridge**: parking entry/exit publishes to `dm3.parking.{tid}.access.{direction}`; access-svc `ParkingAccessConsumer` (`backend/internal/access/parking_access_consumer.go`) ingests into `dm3_access.access_events` with `source=parking` metadata and `user_name=vehicle:{plate}`.
    - **Phase 4 — Barrier auto-registration**: parking zone create/update/delete publishes to `dm3.parking.{tid}.zone.barrier_sync`; access-svc `ParkingBarrierConsumer` upserts `access_devices` (source=parking, source_ref=zone_id, type=barrier), creates matching `access_points`, links via `access_point_devices` with roles `reader_in`/`reader_out`. Idempotent via `UNIQUE(tenant_id, source, source_ref)`.
    - **Phase 5 — Opt-in access policy check**: `parking_settings.enforce_access_rules=true` triggers cross-module check in `CreateParkingSession` — validates user belongs to an access_group whose access_points reference the zone's `access_zone_id` before allowing entry. Gracefully degrades when zone has no `access_zone_id`, vehicle has no owner, or setting is disabled.
  - Infrastructure: Docker Compose service, nginx proxy, Makefile entry all configured.
  - Frontend: Plugin-gated routes with `PluginGuard`, sidebar conditionally shows parking nav. Page content is still mock-data shell.
  - Deviation: Frontend pages need to be connected to real API endpoints (same pattern as visitor module).

- **Maintenance** (`MaintenancePage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Low
  - Evidence: `apps/console/src/features/operate/maintenance/MaintenancePage.tsx` — imports mock-data
  - Deviation: No backend implementation.

- **IoT Energy** (`IoTEnergyPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Low
  - Evidence: `apps/console/src/features/operate/iot-energy/IoTEnergyPage.tsx` — imports mock-data
  - Deviation: No energy monitoring backend service.

- **Key Management** (`KeyManagementPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/operate/keys/KeyManagementPage.tsx` — imports mock-data
  - Deviation: No keys table or backend service.

- **Guard Tour** (`GuardTourPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/operate/guard-tour/GuardTourPage.tsx` — imports mock-data
  - Deviation: No guard tour backend service.

#### SMART Domain — ⚠️ ALL PAGES ARE MOCK-DATA SHELLS

- **Analytics** (`AnalyticsPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/smart/analytics/AnalyticsPage.tsx:4` — `import ... from './mock-data'`; no analytics service in `backend/cmd/`
  - Deviation: No backend analytics service. TimescaleDB `access_events` hypertable exists as the data source, but no aggregation/query service.

- **Automation** (`AutomationPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Low
  - Evidence: `apps/console/src/features/smart/automation/AutomationPage.tsx` — imports mock-data
  - Deviation: No automation rules engine backend.

- **AI Assistant** (`AIAssistantPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Low
  - Evidence: `apps/console/src/features/smart/ai-assistant/AIAssistantPage.tsx` — imports mock-data
  - Deviation: No AI assistant backend service.

### Shared Libraries

- **`packages/ui/`** — shadcn/ui components, theme system
  - Status: ✅ Compliant | Risk: Low
  - Evidence: Directory exists with shared components; used across all feature pages

- **`packages/api-client/`** — OpenAPI-generated client, WebSocket integration
  - Status: ✅ Compliant | Risk: Low
  - Evidence: Used by DashboardPage, DeviceDetailPage, IdentitiesPage, PersonDetailPage; real-time Zustand store confirmed

### Infrastructure (Docker)

- **TimescaleDB** (port 5433)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `backend/docker-compose.yml:3` — `image: timescale/timescaledb:2.17.2-pg16`; `access_events` hypertable confirmed in migration

- **EMQX** (port 1884)
  - Status: ⚠️ Partial | Risk: High
  - Evidence: `docker-compose.yml:22` — `image: emqx/emqx:5.8.3` confirmed
  - Deviation: No TLS 1.3 configuration found in docker-compose or EMQX config. Spec (`mqtt-protocol.md` §11) requires TLS for device connections. Running without TLS in current config.

- **NATS** (port 4222)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `docker-compose.yml:41` — `image: nats:2.10-alpine`; JetStream subjects used by gateway confirmed

- **Valkey** (port 6380)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `docker-compose.yml:58` — `image: valkey/valkey:8.0-alpine`

- **MinIO** (port 9002)
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `docker-compose.yml:73` — `image: minio/minio:latest`

- **Simulator** (port 9090)
  - Status: ⚠️ Partial | Risk: Low
  - Evidence: Simulator exists in `simulator/docker-compose.yml` (separate compose, not integrated into main `backend/docker-compose.yml`)
  - Deviation: Not in the main compose stack — requires manual separate startup.

### Mobile/Terminal

- **Android Terminal** (`dm3-terminal/`)
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: `dm3-terminal/` contains 60+ Kotlin files; MQTT integration files present; provisioning flow exists
  - Deviation: MQTT topic structure in terminal app not cross-verified against `mqtt-protocol.md` spec — subtopic naming and QoS levels require manual comparison. Face recognition module present in code but `docs/specs/devices/android-terminal.md` verification not complete.

- **Flutter Apps** (placeholder structure)
  - Status: ❌ Gap | Risk: Low
  - Evidence: Flutter directory structure exists but contains placeholder only — no implementation
  - Deviation: Listed as "Implemented" in prior doc version; reclassified as Gap.

### Real-time Features

- **WebSocket Integration**
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `backend/internal/gateway/websocket.go` confirmed; `DashboardPage.tsx` consumes live events via `useQuery` + WebSocket store

- **Toast Notifications**
  - Status: ⚠️ Partial | Risk: Low
  - Evidence: UI component exists in `packages/ui/`
  - Deviation: Backend event → notification pipeline not confirmed. Toast appears triggered by frontend state only.

- **Auto-reconnect**
  - Status: ⚠️ Partial | Risk: Low
  - Evidence: WebSocket reconnect logic not directly verified in this audit pass.
  - Deviation: Requires deeper inspection of `packages/api-client/` WebSocket store.

- **Event Deduplication**
  - Status: ⚠️ Partial | Risk: Low
  - Evidence: `dm3_devices.used_nonces` table confirms replay protection at device level. Frontend deduplication not verified.

---

## 📋 Specified (has spec, not yet built)

Features with detailed specifications in `docs/specs/` but not yet implemented:

### SECURE Domain
- **Multi-factor Authentication** — Additional auth layers beyond JWT
- **Advanced Anomaly Detection** — ML-based unusual pattern detection
- **Facial Recognition Integration** — Biometric identity verification

### MANAGE Domain
- **HR System Integration** — Auto-sync employee data from HRIS
- **Mobile Credentials** — Smartphone-based access credentials
- **Self-service Portal** — Employee self-management interface
- ~~**Advanced Visitor Workflows** — Complex approval and escort processes~~ → **Implemented** (Phase 1 + v2). Phase 1: Visitor CRUD, visit scheduling, walk-in, watchlist, QR, badge, auto-checkout. V2 (migration 003): visit groups, recurring templates, access log, agreements/NDA, per-tenant settings, analytics, evacuation list, reinvite, batch create. Remaining Phase 3: multi-level approval chains, escort GPS tracking, contractor badge integration.

### OPERATE Domain
- **Advanced Booking Features** — Recurring bookings, resource conflicts, calendar sync
- **License Plate Recognition** — Automated vehicle identification
- **Mobile Work Orders** — Field technician mobile interface
- **Sensor-based Occupancy** — Room usage detection via IoT sensors

### SMART Domain
- **Predictive Analytics** — ML-based predictions and insights
- **Advanced Automation Rules** — Complex condition-based automation
- **Energy Optimization** — AI-driven energy efficiency recommendations

### PLATFORM Domain
- **Advanced Reporting Engine** — Custom report builder with templates
- **API Rate Limiting** — Advanced API protection and quotas
- ~~**Audit Trail Enhancement** — Detailed compliance and forensic logging~~ → **Implemented** as standalone `audit-svc` (port 8001). Consumes audit events via NATS JetStream, batch-inserts to `dm3_audit.audit_logs` hypertable. Query API at `/api/v1/audit/`.
- **Mobile-responsive UI** — Full mobile optimization across all features

### DEVICES Domain
- **Linux Controller** — Linux-based access controller support
- **Advanced Device Health** — Predictive maintenance and diagnostics
- **Bulk Device Management** — Mass provisioning and configuration tools

---

## 🔮 Vision Only (in VISION.md, no spec yet)

High-level features mentioned in vision documents but lacking detailed specifications:

### Next-Generation Features
- **🆕 Mobile Clock-in** — GPS-verified mobile attendance for field workers
- **🆕 No-show Detection** — Auto-release rooms if no one shows up (via sensors)
- **🆕 EV Charging** — Electric vehicle charger management & billing
- **🆕 Mobile Work Orders** — Technicians receive and update from phone
- **🆕 AI Predictive Maintenance** — Predict device failures before they happen
- **🆕 Energy Analytics** — Consumption patterns, cost trends, sustainability metrics
- **🆕 Mobile Dashboard** — Full dashboard experience on phone/tablet

### Integration Expansions
- **Multi-site Management** — Enterprise-scale facility management
- **Third-party Integrations** — ERP, HRIS, BMS system connectivity
- **IoT Device Ecosystem** — Support for broader IoT device categories
- **Cloud-native Deployment** — Kubernetes and cloud platform optimization

### Advanced AI/ML
- **Behavioral Analytics** — Long-term pattern analysis and insights
- **Automated Threat Response** — AI-driven security incident handling
- **Predictive Occupancy** — Space utilization forecasting
- **Smart Resource Allocation** — AI-optimized facility resource management

### Vertical-Specific Features
- **School-specific** — Student/parent terminology, attendance focus
- **Factory-specific** — Shift management, safety compliance, industrial workflows
- **Apartment-specific** — Resident portal, package management, community features

---

## Summary

- **✅ Compliant** (fully matches spec): auth-svc (v1), access-svc current scope (including zones + managed map assets), device-gateway, audit-svc, MQTT pipeline, Dashboard, Devices, SystemSettings, IdentityManagement, AccessGroups/AccessControl, VisitorManagement, NATS, Valkey, MinIO, TimescaleDB, shared packages — **~16 items**
- **⚠️ Partial** (UI shell or missing components): 19+ frontend pages are mock-data-only; parking has full backend but frontend still mock-only; AP passage time UI is still missing; EMQX missing TLS; Android terminal unverified; Flutter is placeholder — **~25 items**
- **❌ Gap** (claimed implemented, not found): Flutter apps, service topology (13 of ~20 services missing) — **~2 items + systemic**
- **📋 Specified**: ~15 features with detailed specs ready for development
- **🔮 Vision Only**: ~20 next-generation features awaiting specification

> **Audit note:** The prior "~40 major features Implemented" claim overstates completeness. The core platform (auth, devices, identity, real-time pipeline, audit trail) is genuinely implemented end-to-end. Visitor management is fully implemented (backend + frontend) with schema isolation: `dm3_visitor` is an independently deployable schema with its own service (visitor-svc, port 8006). Parking management has a full backend implementation: standalone `parking-svc` (port 8007), isolated `dm3_parking` schema (7 tables), 19 API endpoints, NATS events, plugin gating, unit + integration tests, and seed data. As of 2026-04-12 (migrations 000010–000012), parking-svc is cross-integrated with access-svc: unified vehicle registry with triple credentials (plate/RFID/NFC), parking zones linked into access zone hierarchy via soft-FK, NATS event bridge (parking → `dm3_access.access_events`), barrier device auto-registration into `dm3_access.access_devices`, and an opt-in cross-module access-policy check gated by `parking_settings.enforce_access_rules`. The frontend pages are still mock-data shells. See `docs/architecture/module-isolation.md`. The remaining domain feature layer (OPERATE excluding parking, SMART, most of SECURE) exists as frontend UI prototypes backed by mock data.
