# Graph Report - backend + docs  (2026-04-08)

## Corpus Check
- 116 files · ~226,991 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 957 nodes · 1178 edges · 110 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 170 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Handlers` - 70 edges
2. `UserManagementHandlers` - 22 edges
3. `Attendance Feature Spec` - 15 edges
4. `UserManagementHandlers` - 13 edges
5. `Identity Management Feature Spec` - 13 edges
6. `System Architecture Document` - 13 edges
7. `Handlers` - 11 edges
8. `MQTTHandler` - 11 edges
9. `Android Terminal DF-970 Spec` - 11 edges
10. `Handlers` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Middleware()` --calls--> `writeError()`  [INFERRED]
  backend/pkg/bugreporter/middleware.go → backend/internal/tenant/middleware.go
- `Middleware()` --calls--> `loadTenantInfo()`  [INFERRED]
  backend/pkg/bugreporter/middleware.go → backend/internal/tenant/middleware.go
- `RequireTenant()` --calls--> `Middleware()`  [INFERRED]
  backend/internal/tenant/middleware.go → backend/pkg/bugreporter/middleware.go
- `OptionalTenant()` --calls--> `Middleware()`  [INFERRED]
  backend/internal/tenant/middleware.go → backend/pkg/bugreporter/middleware.go
- `SystemAdminTenant()` --calls--> `Middleware()`  [INFERRED]
  backend/internal/tenant/middleware.go → backend/pkg/bugreporter/middleware.go

## Hyperedges (group relationships)
- **Multi-Tenant Pattern** — concept_multitenant, authsvc_middleware, identity_handlers, identity_userhandlers, access_handlers, access_natsconsumer, concept_nats_tenantid_subject [INFERRED 0.85]
- **JWT Claims Structs** — authsvc_accessclaims, concept_twostep_login, concept_jwt_grace_period [EXTRACTED 1.00]
- **MQTT to NATS to WebSocket Bridge Pipeline** — gateway_mqtthandler, natsutil_client, gateway_eventhub, mqtt_client [EXTRACTED 1.00]
- **Device Provisioning Flow** — gateway_provisioninghandlers, gateway_bootstrapmqtthandler, gateway_generatedevicejwt, mqtt_client [EXTRACTED 1.00]
- **Three Domains Architecture (Vision + Research + Design)** — vision_three_domains, competitor_analysis_recommendation, design_system_colors [INFERRED 0.90]
- **Offline-First Architecture Decision** — changelog_offline_first, changelog_offline_core_change, android_techstack_df970 [INFERRED 0.85]
- **Monorepo + Fork Strategy** — changelog_monorepo, changelog_fork_strategy, changelog_monorepo_rationale, changelog_fork_rationale [EXTRACTED 0.95]
- **Emergency Orchestration Network** — svc:emergency-svc, svc:access-svc, svc:video-svc, svc:notif-svc, svc:automate-svc, svc:device-gw, svc:iot-svc, svc:intrusion-detection-svc, infra:emqx [INFERRED 1.00]
- **Offline-First Device Ecosystem** — concept:offline-first-device, concept:device-sqlite, concept:incremental-sync, concept:device-grace-period, concept:barrier-offline, concept:nfc-qr-checkpoint, concept:alarm-zone, svc:access-svc, svc:device-gw, infra:nats [INFERRED 1.00]
- **NATS Event Streaming Backbone** — infra:nats, svc:device-gw, svc:access-svc, svc:analytics-svc, svc:automate-svc, svc:vision-svc, svc:ai-asst-svc [INFERRED 1.00]
- **Identity & Credential Management Mesh** — svc:identity-svc, svc:access-svc, svc:visitor-svc, svc:contractor-svc, svc:device-gw, infra:emqx [INFERRED 1.00]
- **Video AI Processing Pipeline** — infra:go2rtc, svc:video-svc, svc:vision-svc, svc:access-svc, svc:parking-svc, svc:emergency-svc, infra:nats [INFERRED 1.00]
- **Analytics Data Aggregation Mesh** — svc:analytics-svc, svc:access-svc, svc:iot-svc, svc:parking-svc, svc:maintenance-svc, svc:visitor-svc, svc:booking-svc, infra:timescaledb, infra:clickhouse [INFERRED 1.00]
- **AI Assistant Full-Stack Integration** — svc:ai-asst-svc, infra:ollama-vllm, svc:access-svc, svc:iot-svc, svc:analytics-svc, svc:maintenance-svc, svc:parking-svc, svc:visitor-svc, svc:emergency-svc, svc:booking-svc, svc:video-svc [INFERRED 1.00]
- **Multi-Tenant Architecture Boundary** — svc:auth-svc, svc:tenant-svc, svc:identity-svc, svc:access-svc, infra:nats, infra:timescaledb [INFERRED 1.00]
- **SECURE Domain Cross-Feature Integration** — svc:access-svc, svc:video-svc, svc:vision-svc, svc:emergency-svc, svc:intrusion-detection-svc, svc:device-gw, infra:emqx [INFERRED 0.90]
- **Visitor Access Lifecycle** — svc:visitor-svc, svc:identity-svc, svc:access-svc, svc:device-gw, svc:vision-svc, svc:notif-svc, concept:visitor-qr-token, concept:visitor-watchlist, concept:visitor-temp-credentials [INFERRED 1.00]
- **IoT Energy Data Consumers** — svc:iot-svc, svc:analytics-svc, svc:automate-svc, svc:maintenance-svc, svc:ai-asst-svc, svc:booking-svc, svc:parking-svc [INFERRED 1.00]
- **Automation Trigger-Action Network** — svc:automate-svc, svc:access-svc, svc:iot-svc, svc:device-gw, svc:notif-svc, svc:video-svc, svc:emergency-svc, infra:nats, infra:emqx [INFERRED 1.00]
- **Offline-First Access Decision Pattern** — tech_stack_offline_first_principle, android_terminal_access_decision_engine, linux_controller_decision_engine, device_simulator_access_engine, mqtt_offline_first_rationale, identity_offline_first_rationale, attendance_offline_first_rationale, android_terminal_offline_first_rationale, marketing_offline_first_differentiator [INFERRED 0.88]
- **MANAGE Domain Feature Set** — attendance_feature, identity_feature, provisioning_feature, marketing_three_domains, webapp_ux_main_layout [EXTRACTED 0.95]
- **MQTT Device Communication Stack** — mqtt_protocol, mqtt_emqx_broker, mqtt_topic_hierarchy, mqtt_message_envelope, mqtt_access_log_event, android_terminal_mqtt_service, device_simulator_mqtt_client, linux_controller_spec [INFERRED 0.87]
- **Credential Sync Pipeline** — identity_credential, identity_credentialsyncstate, android_terminal_sync_manager, device_simulator_sync_handler, identity_sync_version_rationale, mqtt_topic_hierarchy [INFERRED 0.82]
- **DM3 UX Surface Family** — guard_station_ux, terminal_ux, mobile_ux, webapp_ux [INFERRED 0.85]
- **Attendance Event Processing Pipeline** — mqtt_access_log_event, system_arch_nats, attendance_feature, attendance_attendancerecord, attendance_attendancedevice [EXTRACTED 0.90]

## Communities

### Community 0 - "Multi-Service Handler Layer"
Cohesion: 0.02
Nodes (36): AccessClaims, accountForLogin, addMemberRequest, boolVal(), changePasswordRequest, companyInfo, createCredentialRequest, createDeviceRequest (+28 more)

### Community 1 - "Device Ecosystem & UX"
Cohesion: 0.03
Nodes (90): Access Decision Engine (DF-970), Face Recognition Manager (DF-970), Megvii MegFace SDK (DF-970), MQTT Foreground Service (DF-970 HiveMQ), DF-970 Offline-First Principle Rationale, Room DB SQLite (DF-970), Android Terminal DF-970 Spec, Sync Manager (DF-970) (+82 more)

### Community 2 - "Smart Features & Infrastructure Map"
Cohesion: 0.1
Nodes (51): On-Premise LLM, AI Function Registry, AI Rate Limits, Alarm Zone, Analytics Dashboard/Widget, Anomaly Detection, Alarm Arm Modes, Contractor Auto-Suspend (+43 more)

### Community 3 - "Auth Service (authsvc)"
Cohesion: 0.06
Nodes (28): auth.Claims, AuthHandlers, getClientIP(), LoginRequest, LoginResponse, NewAuthHandlers(), RegisterAuthRoutes(), Connect() (+20 more)

### Community 4 - "Auth Package & Context Utils"
Cohesion: 0.05
Nodes (17): Auth(), contextKey, writeErr(), CompanyIDFromContext(), contextKey, MustCompanyID(), MustTenantID(), MustTenantInfo() (+9 more)

### Community 5 - "NATS & Messaging Client"
Cohesion: 0.06
Nodes (20): Client, Connect(), matchTopic(), MessageHandler, Options, BugReport, Config, min() (+12 more)

### Community 6 - "Access Time Management"
Cohesion: 0.05
Nodes (17): getSlotDisplayName(), Handlers, Department, DepartmentFormData, DepartmentImportData, DepartmentManager, DepartmentUser, FirmwareDTO (+9 more)

### Community 7 - "User Management Handlers"
Cohesion: 0.07
Nodes (6): BulkOperationRequest, BulkOperationResponse, CreateUserRequest, getUserIDFromContext(), UpdateUserRequest, UserManagementHandlers

### Community 8 - "Access & Auth Semantic Layer"
Cohesion: 0.09
Nodes (29): Access Handlers, NATS Consumer (access-svc), AccessClaims JWT Struct, Company Handlers, Auth Service Handlers, Auth Middleware, User Account Handlers, Credential Types (face/card/pin/qr/fingerprint) (+21 more)

### Community 9 - "Access Control Concepts (Offline-First)"
Cohesion: 0.1
Nodes (27): Local Access Decision, Anti-Passback, Barrier Controller Offline Cache, Blacklist Priority, Bootstrap Provisioning Flow, 7-day JWT Grace Period, Device JWT, Device SQLite Store (+19 more)

### Community 10 - "Access Domain Models"
Cohesion: 0.09
Nodes (21): AccessRule, AccessTimeSlot, AccessTimeStats, AccessTimeTemplate, AccessTimeValidation, AssignAccessTimeRequest, CreateAccessTimeTemplateRequest, DashboardStats (+13 more)

### Community 11 - "Device Provisioning"
Cohesion: 0.11
Nodes (10): activateRequest, approveRequest, BootstrapMQTTHandler, bootstrapRegisterMsg, deviceJWTClaims, generateDeviceJWT(), ProvisioningHandlers, provisionRequest (+2 more)

### Community 12 - "Handler Tests"
Cohesion: 0.13
Nodes (8): setupRouter(), setupTestDB(), TestCredentialsCRUD(), TestGroupsCRUD(), TestPersonsCRUD(), TestStatsEndpoint(), TestSyncEndpoint(), TestValidation()

### Community 13 - "Auth Middleware Layer"
Cohesion: 0.13
Nodes (16): AuthMiddleware(), ClaimsFromContext(), contextKey, formatPanicError(), IsolationMode, loadTenantInfo(), Middleware(), OptionalTenant() (+8 more)

### Community 14 - "MQTT Message Handler"
Cohesion: 0.15
Nodes (6): accessLogData, heartbeatData, MQTTEnvelope, MQTTHandler, ParsedTopic, ParseTopic()

### Community 15 - "Tenant Validation & Security"
Cohesion: 0.12
Nodes (3): ResourceValidator, SecurityAuditor, TenantLimitChecker

### Community 16 - "Auth Helpers & Session"
Cohesion: 0.18
Nodes (6): AccountInfo, AuthService, generateSecureToken(), getStringPtr(), hashToken(), SessionInfo

### Community 17 - "Tenant-Aware Database"
Cohesion: 0.2
Nodes (2): QueryBuilder, TenantAwareDB

### Community 18 - "IoT & Facility Operations"
Cohesion: 0.14
Nodes (15): Calendar Sync, Energy Meter Types, ESG Reporting, IoT Gateway Offline Buffering, IoT Sensor Types, Parts Inventory, Preventive Maintenance Schedule, Room Check-in via QR (+7 more)

### Community 19 - "Department Management"
Cohesion: 0.14
Nodes (1): UserManagementHandlers

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (14): AI as Cross-Cutting Capability, Three Domains Architecture Recommendation, DM3 Color System & Domain Colors, DM3 Design System v1.0, i18n Feature Specification, i18n Backend Stack (Go pkg/i18n), Multi-Tenancy Feature Specification, Tenant Isolation Architecture (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (13): Camera Credentials Encrypted, Camera Stream JWT Auth, Emergency Broadcast Override, Event-Linked Video Clips, go2rtc Proxy, NVR Storage Alerts, ONVIF Camera Management, Ring Group Routing (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (13): AI Detection Types, Escort Enforcement, Face Recognition Opt-In, False Positive Feedback Loop, GPU Resource Management, vision-svc, Visitor Auto-Checkout, Visitor QR Token (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.23
Nodes (1): Handlers

### Community 24 - "Community 24"
Cohesion: 0.2
Nodes (12): Fire Emergency Override, Emergency MQTT QoS 2, Emergency Permanent Retention, Emergency Types, Hardware Failsafe Wiring, Security Lockdown, Emergency Spec, BR-EM-003 (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (1): Handlers

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (8): Auth v1 (Go auth-svc), Auth v2 (Keycloak-backed), JWKS Local Validation, Refresh Token Rotation, Auth Spec, Keycloak, Valkey (Redis-compatible), BR-AUTH-001 to BR-AUTH-014

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (6): Credential, IdentityStats, SyncResponse, User, UserGroup, UserGroupMember

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (5): createUserAccountRequest, createUserAccountResponse, updateUserAccountRequest, userAccountResponse, userCompanyInfo

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (5): companyStat, deviceStat, recentStat, systemStats, userStat

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (5): adminInfo, companyResponse, createCompanyRequest, createCompanyResponse, updateCompanyRequest

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (1): Handlers

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 0.47
Nodes (5): Error(), ErrorResponse, JSON(), Paginated(), PaginatedResponse

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (6): Delivery Auto-Notification, Uncollected Package Alerts, Package ID Format, Smart Locker MQTT Integration, Vietnamese Carrier Integration, Delivery Management Spec

### Community 35 - "Community 35"
Cohesion: 0.47
Nodes (6): Automation Action Types, Automation Rule Engine, Automation Suspend on Emergency, Automation Trigger Types, Automation Spec, BR-AU-008

### Community 36 - "Community 36"
Cohesion: 0.4
Nodes (1): responseWriter

### Community 37 - "Community 37"
Cohesion: 0.4
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (2): Claims, ValidateToken()

### Community 39 - "Community 39"
Cohesion: 0.4
Nodes (5): Fork Strategy Rationale (AI era), Frontend Fork Strategy: Shared Core + Fork per Vertical, Monorepo Restructure Changelog, Monorepo Rationale (Vertical Specialization), DM3 Target Market Segments

### Community 40 - "Community 40"
Cohesion: 0.6
Nodes (5): GPS Tracking, NFC/QR Checkpoint Scanning, Patrol Compliance Score, Tag Fraud Detection, Guard Tour Spec

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (5): Contractor 7-Year Audit Retention, Contractor Compliance Score, Contractor Safety Training, Contractor Management Spec, BR-CON-003

### Community 42 - "Community 42"
Cohesion: 0.5
Nodes (4): Database Query Pattern (pgx no ORM), Go Backend Code Conventions, HTTP Handler Pattern, Backend Language Comparison (Go vs others)

### Community 43 - "Community 43"
Cohesion: 0.5
Nodes (4): WebSocket Integration Changelog, WebSocket Client + Realtime Store Components, WebSocket Real-time Pattern, device-gateway Implementation Status

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (4): DF-970 Android Terminal Tech Stack, Face Recognition Stack (ML Kit + MobileFaceNet), Core Change: Local Decision vs Server Decision, Offline-First Architecture Decision

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 2.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): AccessEvent

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Device

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Handlers

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (2): ActivateDevice Handler, generateDeviceJWT

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (2): BugReporter Middleware, BugReporter Reporter

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (2): E2E Event Pipeline, DM3 Simulator

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (2): Implementation Status Critical Findings, Frontend Mock-Data Shell Problem

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (2): TypeScript/React Frontend Conventions, Frontend Framework Comparison

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): access-svc main

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): auth-svc main

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): device-gateway main

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): identity-svc main

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): tenant Department Handlers

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): tenant Middleware Test

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): tenant Department Routes

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): tenant Auth Handlers

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): tenant Handlers (Tenant/Company Management)

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): tenant Database (QueryBuilder + TenantAwareDB)

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): tenant Database Test

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): tenant User Management Routes

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): tenant Context (TenantInfo, context keys)

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): tenant Validation (ResourceValidator, SecurityAuditor, LimitChecker)

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): tenant Routes (RegisterRoutes)

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): tenant Middleware (IsolationMode)

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): tenant Auth Helpers (AuthService, AccountInfo, SessionInfo)

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (1): tenant User Management Handlers

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): middleware CORS

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): middleware Auth (legacy JWT)

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (1): Tenant Isolation (multi-tenancy pattern)

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): IsolationMode (Strict/Optional/SystemAdmin)

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): QueryBuilder (tenant-aware SQL builder)

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): TenantAwareDB (auto tenant filter wrapper)

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (1): Department (model)

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (1): AuthService (consolidated auth)

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (1): AccountInfo (consolidated auth account)

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (1): SessionInfo (active user session)

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (1): TenantInfo (tenant context struct)

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (1): ResourceValidator (per-resource tenant check)

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (1): SecurityAuditor (data integrity audit)

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (1): TenantLimitChecker (quota enforcement)

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (1): NATS Stream DEVICES (dm3.devices.>)

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (1): NATS Stream IDENTITY (dm3.identity.>)

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (1): access.NATSConsumer (access event consumer)

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (1): gateway.MQTTHandler

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (1): gateway.SyncService

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (1): gateway.EventHub (WebSocket)

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (1): bugreporter (auto 5xx reporting)

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (1): Graceful Shutdown Pattern (all services)

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (1): Logging Middleware

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (1): Identity Handlers Tests

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (1): Access Handlers Tests

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (1): Access Time Handlers

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (1): Device Model

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (1): Auth Stats Handlers

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (1): httputil Router Factory

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (1): pkg/auth JWT

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (1): DM3 Backend Services Overview

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (1): auth-svc Implementation Status

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (1): access-svc Implementation Status

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (1): identity-svc Implementation Status

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (1): Anti-Patterns (DM3)

## Knowledge Gaps
- **238 isolated node(s):** `Department`, `DepartmentFormData`, `DepartmentUser`, `DepartmentManager`, `DepartmentImportData` (+233 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 45`** (2 nodes): `department_routes.go`, `AddDepartmentRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `user_management_routes.go`, `AddUserManagementRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `cors.go`, `CORS()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `event.go`, `AccessEvent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `device.go`, `Device`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `Handlers`, `.SystemStats()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `ActivateDevice Handler`, `generateDeviceJWT`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `BugReporter Middleware`, `BugReporter Reporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `E2E Event Pipeline`, `DM3 Simulator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `Implementation Status Critical Findings`, `Frontend Mock-Data Shell Problem`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `TypeScript/React Frontend Conventions`, `Frontend Framework Comparison`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `user_handlers.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `access-svc main`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `auth-svc main`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `device-gateway main`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `identity-svc main`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `tenant Department Handlers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `tenant Middleware Test`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `tenant Department Routes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `tenant Auth Handlers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `tenant Handlers (Tenant/Company Management)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `tenant Database (QueryBuilder + TenantAwareDB)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `tenant Database Test`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `tenant User Management Routes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `tenant Context (TenantInfo, context keys)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `tenant Validation (ResourceValidator, SecurityAuditor, LimitChecker)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `tenant Routes (RegisterRoutes)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `tenant Middleware (IsolationMode)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `tenant Auth Helpers (AuthService, AccountInfo, SessionInfo)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `tenant User Management Handlers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `middleware CORS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `middleware Auth (legacy JWT)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `Tenant Isolation (multi-tenancy pattern)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `IsolationMode (Strict/Optional/SystemAdmin)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `QueryBuilder (tenant-aware SQL builder)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `TenantAwareDB (auto tenant filter wrapper)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `Department (model)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `AuthService (consolidated auth)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `AccountInfo (consolidated auth account)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `SessionInfo (active user session)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `TenantInfo (tenant context struct)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `ResourceValidator (per-resource tenant check)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `SecurityAuditor (data integrity audit)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `TenantLimitChecker (quota enforcement)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `NATS Stream DEVICES (dm3.devices.>)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `NATS Stream IDENTITY (dm3.identity.>)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `access.NATSConsumer (access event consumer)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `gateway.MQTTHandler`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `gateway.SyncService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `gateway.EventHub (WebSocket)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `bugreporter (auto 5xx reporting)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `Graceful Shutdown Pattern (all services)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (1 nodes): `Logging Middleware`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (1 nodes): `Identity Handlers Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `Access Handlers Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (1 nodes): `Access Time Handlers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `Device Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `Auth Stats Handlers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `httputil Router Factory`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `pkg/auth JWT`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `DM3 Backend Services Overview`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `auth-svc Implementation Status`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `access-svc Implementation Status`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `identity-svc Implementation Status`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `Anti-Patterns (DM3)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 3 inferred relationships involving `Attendance Feature Spec` (e.g. with `Terminal Attendance Clock-in Flow` and `Web Console Main Layout Shell UX`) actually correct?**
  _`Attendance Feature Spec` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Department`, `DepartmentFormData`, `DepartmentUser` to the rest of the system?**
  _238 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Multi-Service Handler Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Device Ecosystem & UX` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Smart Features & Infrastructure Map` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Auth Service (authsvc)` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Auth Package & Context Utils` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._