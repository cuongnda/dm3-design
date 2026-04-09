# Implementation Status

This document tracks the current implementation status of DM3 features. Updated: 2026-04-07 (Architecture Compliance Audit).

---

## ⚠️ Critical Findings

> **Two systemic gaps found that cannot be buried in per-item detail:**
>
> 1. **Service topology is 25% implemented.** The architecture doc (`docs/architecture/system-architecture.md:281`) specifies ~20 microservices. 5 exist in `backend/cmd/` (auth-svc, access-svc, identity-svc, device-gateway, audit-svc). All domain services (visitor-svc, booking-svc, parking-svc, guard-tour-svc, analytics-svc, etc.) are absent.
>
> 2. **The majority of frontend pages are mock-data-only UI shells.** 21 of ~30 feature pages import from `mock-data` files or define inline hardcoded arrays with zero API client usage. ALL OPERATE, ALL SMART, and most SECURE/MANAGE pages are visual prototypes, not working features. Only DashboardPage, DeviceDetailPage, IdentitiesPage/PersonDetailPage/GroupsPage, and SystemSettingsPage integrate with real backend APIs.
>
> **Action required:** These findings should be reviewed by the team before treating the per-item compliance table below as a routine status update.

---

## Architecture Compliance Summary

| Layer | Status | Details |
|-------|--------|---------|
| Service Topology | ❌ Gap | 5 of ~20 specified services implemented. Evidence: `backend/cmd/` has 5 dirs (auth-svc, identity-svc, access-svc, device-gateway, audit-svc); `docs/architecture/system-architecture.md:281` specifies ~20 |
| Data Flow / MQTT Pipeline | ✅ Compliant | Topic `dm/{tid}/device/{did}/{cat}` confirmed. Envelope (v, id, ts) confirmed. NATS bridge confirmed. Evidence: `backend/internal/gateway/mqtt_handler.go:48-57, 27-35` |
| Data Model / ER | ⚠️ Partial | 19 tables exist. Missing: sites, zones, visitors, contractors, rooms, parking, maintenance, keys. `doors` table has dangling `site_id`/`zone_id` FKs. `dm3_audit` schema is active (audit_logs hypertable, populated by audit-svc via NATS). |
| Security | ⚠️ Partial | JWT auth, bcrypt, CORS, refresh-token replay detection confirmed. Missing: TLS config in docker-compose for EMQX, no rate limiting middleware found. |
| Deployment | ✅ Compliant | All 6 infra services present in `backend/docker-compose.yml` with correct ports. Simulator is in a separate `simulator/docker-compose.yml` (minor split). No Traefik gateway config found. |

---

## ✅ Implemented (Compliance-Audited)

### Backend Services (Go)

- **auth-svc** (`backend/internal/authsvc/`) — JWT auth, bcrypt, refresh tokens, RBAC, two-step company login
  - Status: ✅ Compliant (v1) | Risk: Low
  - Evidence: `handlers.go:824-840` — `generateAccessToken` emits sub, cid, email, name, role, exp, iat (15min TTL ✅); `handlers.go:565-590` — DeviceClaims with sub, cid, did, dtype, permissions (24h ✅); `handlers.go:366-372` — refresh token rotation + replay detection ✅; bcrypt confirmed at `handlers.go:166, 662, 767`
  - Deviation: `GET /api/v1/roles` returns generic `admin/operator/viewer` (handlers.go:797-800) but spec defines 5 roles: `system_admin, primary_manager, manager, operator, viewer`. Roles endpoint is stale.

- **access-svc** (`backend/internal/access/`) — Access event processing, door management, access rules engine
  - Status: ⚠️ Partial | Risk: High
  - Evidence: `backend/pkg/db/migrations/000001_initial.up.sql` — `dm3_access.doors`, `dm3_access.access_rules`, `dm3_access.access_events` (hypertable) confirmed; NATS consumer in `nats_consumer.go`
  - Deviation: No `sites` or `zones` tables in migration. `doors` has `site_id`/`zone_id` columns but FKs reference non-existent tables (dangling references). Site/zone hierarchy from spec is unimplemented.

- **identity-svc** (`backend/internal/identity/`) — User/credential management, identity operations
  - Status: ⚠️ Partial | Risk: Medium
  - Evidence: Migration confirms `dm3_identity.users`, `dm3_identity.credentials`, `dm3_identity.user_groups`, `dm3_identity.departments` ✅
  - Deviation: No `visitors`, `contractors`, `rooms`, `parking`, or `maintenance` tables. These features listed as "Implemented" in prior version of this doc are mock-UI only (no backend tables).

- **device-gateway** (`backend/internal/gateway/`) — MQTT bridge, device provisioning, sync coordination, WebSocket events
  - Status: ✅ Compliant | Risk: Low
  - Evidence: `mqtt_handler.go:47-57` — topic `dm/{cid}/device/{did}/{category}` parsed correctly; `mqtt_handler.go:27-35` — MQTTEnvelope (v, id, ts) ✅; `mqtt_handler.go:119` — NATS bridge publishes to `dm3.devices.{tenantID}.{deviceID}.{category}` ✅; provisioning tables confirmed in migration (provisioning_tokens, pending_registrations, used_nonces)

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

- **Access Control** (`AccessControlPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: High
  - Evidence: `apps/console/src/features/secure/access-control/AccessControlPage.tsx:14-47` — inline `mockDoors` array, zero API calls despite 229 lines
  - Deviation: Backend `access-svc` has real doors and access_rules tables. Frontend is disconnected — no API integration.

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

- **Visitor Management** (`VisitorsPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/manage/visitors/VisitorsPage.tsx` — imports mock-data
  - Deviation: No `visitors` table in migration. Both frontend and backend incomplete.

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

- **Access Provisioning** (`ProvisioningPage`, `AccessRulesPage`)
  - Status: ⚠️ Partial | Risk: High
  - Evidence: `ProvisioningPage.tsx` — imports mock-data; `dm3_access.access_rules` table confirmed in migration
  - Deviation: Frontend is disconnected from `access-svc` access rules API. Access rules are in the DB but not exposed through a working UI.

#### OPERATE Domain — ⚠️ ALL PAGES ARE MOCK-DATA SHELLS

- **Room Booking** (`RoomBookingPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/operate/room-booking/RoomBookingPage.tsx` — imports mock-data; no rooms table in migration
  - Deviation: No backend implementation. Frontend and backend both incomplete.

- **Parking** (`ParkingPage`)
  - Status: ⚠️ Partial (mock-only UI shell) | Risk: Medium
  - Evidence: `apps/console/src/features/operate/parking/ParkingPage.tsx:7` — `import ... from './mock-data'`; no parking table in migration
  - Deviation: No backend implementation.

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
- **Advanced Visitor Workflows** — Complex approval and escort processes

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

- **✅ Compliant** (fully matches spec): auth-svc (v1), device-gateway, audit-svc, MQTT pipeline, Dashboard, Devices, SystemSettings, IdentityManagement, NATS, Valkey, MinIO, TimescaleDB, shared packages — **~13 items**
- **⚠️ Partial** (UI shell or missing components): 21+ frontend pages are mock-data-only; access-svc missing site/zone hierarchy; EMQX missing TLS; Android terminal unverified; Flutter is placeholder — **~28 items**
- **❌ Gap** (claimed implemented, not found): Flutter apps, service topology (15 of ~20 services missing) — **~2 items + systemic**
- **📋 Specified**: ~15 features with detailed specs ready for development
- **🔮 Vision Only**: ~20 next-generation features awaiting specification

> **Audit note:** The prior "~40 major features Implemented" claim overstates completeness. The core platform (auth, devices, identity, real-time pipeline) is genuinely implemented end-to-end. The domain feature layer (OPERATE, SMART, most of SECURE/MANAGE) exists as frontend UI prototypes backed by mock data, with no corresponding backend services.
