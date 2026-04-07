# Duall Master 3.0 — System Architecture

**Document Type:** System Architecture Design  
**Version:** 1.0  
**Date:** February 2026  
**Owner:** Duali Vietnam  
**Status:** Draft  

---

## Table of Contents

1. [High-Level Architecture (C4 Diagrams)](#1-high-level-architecture-c4-diagrams)
2. [Microservices Design](#2-microservices-design)
3. [API Design](#3-api-design)
4. [Data Architecture](#4-data-architecture)
5. [Real-Time Layer](#5-real-time-layer)
6. [Video Pipeline](#6-video-pipeline)
7. [AI/ML Pipeline](#7-aiml-pipeline)
8. [Device Integration Layer](#8-device-integration-layer)
9. [Multi-Tenancy](#9-multi-tenancy)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Security Architecture](#11-security-architecture)
12. [High Availability](#12-high-availability)
13. [Scalability](#13-scalability)

---

## 1. High-Level Architecture (C4 Diagrams)

### 1.1 Context Diagram (Level 1)

Shows Duall Master 3.0 and its external actors.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SYSTEMS                                  │
│                                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │   HR/ERP  │  │  Active  │  │ Calendar │  │ Payment  │  │ Messaging│   │
│   │  Systems  │  │Directory │  │ (Outlook │  │ Gateway  │  │(Telegram │   │
│   │          │  │  / LDAP  │  │  Google) │  │          │  │ Zalo SMS)│   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│        │              │              │              │              │         │
└────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────┘
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        ╔═══════════════════════╗                            │
│                        ║   DUALL MASTER 3.0    ║                            │
│                        ║   Building Platform   ║                            │
│                        ╚═══════════════════════╝                            │
│                                                                             │
└────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────┘
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Security │  │ Building │  │   HR /   │  │ Facility │  │Residents │
│  Guards  │  │  Admin   │  │ Manager  │  │ Manager  │  │ Tenants  │
│          │  │          │  │          │  │          │  │          │
│ Guard Stn│  │ Web + App│  │ Web + App│  │ Web + App│  │Mobile App│
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEVICE LAYER                                      │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│   │Readers │ │Cameras │ │Intercom│ │Sensors │ │Barriers│ │  Lifts │      │
│   │(OSDP)  │ │(ONVIF) │ │ (SIP)  │ │(Zigbee)│ │(RS-485)│ │(RS-485)│      │
│   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Container Diagram (Level 2)

Shows the major deployable units inside Duall Master 3.0.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUALL MASTER 3.0                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      CLIENT TIER                                     │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │   │
│  │  │  Web Console  │  │  Admin App    │  │ Resident App  │           │   │
│  │  │  React + TS   │  │  Flutter      │  │ Flutter       │           │   │
│  │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘           │   │
│  └──────────┼──────────────────┼──────────────────┼────────────────────┘   │
│             │ HTTPS/WSS        │ HTTPS/WSS        │ HTTPS/WSS              │
│             ▼                  ▼                  ▼                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                API GATEWAY — Traefik                                 │   │
│  │  TLS termination · JWT validation · Rate limiting · Load balancing  │   │
│  │  WebSocket upgrade · gRPC proxy · CORS · Request routing            │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼──────────────────────────────────────┐   │
│  │              CORE SERVICES (Go microservices)                        │   │
│  │                              │                                       │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐          │   │
│  │  │  auth-svc │ │access-svc │ │identity-  │ │facility-  │          │   │
│  │  │  Keycloak │ │  Access   │ │  svc      │ │  svc      │          │   │
│  │  │  + custom │ │  Control  │ │ People &  │ │ Operate   │          │   │
│  │  │  Go shim  │ │  Engine   │ │ Visitors  │ │ domain    │          │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘          │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐          │   │
│  │  │ video-svc │ │ alert-svc │ │ device-   │ │ tenant-   │          │   │
│  │  │ Streaming │ │ Automate  │ │ gateway   │ │ svc       │          │   │
│  │  │ & Playback│ │ Rules Eng.│ │ Protocol  │ │ Multi-    │          │   │
│  │  │           │ │           │ │ Adapters  │ │ tenancy   │          │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘          │   │
│  │  ┌───────────┐ ┌───────────┐                                       │   │
│  │  │ notif-svc │ │ report-   │                                       │   │
│  │  │ Push/SMS/ │ │ svc       │                                       │   │
│  │  │ Email     │ │ Analytics │                                       │   │
│  │  └───────────┘ └───────────┘                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼──────────────────────────────────────┐   │
│  │              AI SERVICES (Python / FastAPI)                          │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                        │   │
│  │  │ ai-asst   │ │ vision-   │ │ anomaly-  │                        │   │
│  │  │ LLM proxy │ │ svc       │ │ svc       │                        │   │
│  │  │ Ollama/   │ │ ONNX RT   │ │ ML models │                        │   │
│  │  │ vLLM      │ │ YOLO/Face │ │ PyOD      │                        │   │
│  │  └───────────┘ └───────────┘ └───────────┘                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼──────────────────────────────────────┐   │
│  │              MESSAGING LAYER                                        │   │
│  │  ┌──────────────────────┐  ┌──────────────────────┐                │   │
│  │  │  EMQX  (MQTT 5.0)   │  │  NATS + JetStream    │                │   │
│  │  │  IoT device comms    │  │  Internal event bus   │                │   │
│  │  └──────────────────────┘  └──────────────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼──────────────────────────────────────┐   │
│  │              DATA LAYER                                             │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │   │
│  │  │TimescaleDB │ │  Valkey    │ │   MinIO    │ │ ClickHouse │      │   │
│  │  │ Relational │ │  Cache +   │ │  Object    │ │ Analytics  │      │   │
│  │  │ + TimeSer. │ │  Pub/Sub   │ │  Storage   │ │ (Phase 3)  │      │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼──────────────────────────────────────┐   │
│  │              VIDEO LAYER                                            │   │
│  │  ┌──────────────────────────────────────┐                          │   │
│  │  │  go2rtc — RTSP ↔ WebRTC/HLS proxy   │                          │   │
│  │  └──────────────────────────────────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼──────────────────────────────────────┐   │
│  │              OBSERVABILITY                                          │   │
│  │  Prometheus (metrics) · Grafana (dashboards) · Loki (logs)          │   │
│  │  OpenTelemetry (distributed tracing)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Component Diagram (Level 3) — Access Control Service

Zooming into `access-svc`. **Note:** access-svc is NOT a real-time decision engine. Devices make all access decisions locally. access-svc manages rules, orchestrates sync to devices, and aggregates event logs for analytics.

```
┌─────────────────────────────────────────────────────────────┐
│                     access-svc (Go)                          │
│          Role: Rule Management + Sync + Analytics            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  REST API    │  │  gRPC API    │  │  NATS Sub    │      │
│  │  Handler     │  │  Handler     │  │  Handler     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
│         ▼                  ▼                  ▼               │
│  ┌─────────────────────────────────────────────────┐        │
│  │          Rule & Sync Management Engine           │        │
│  │                                                  │        │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐  │        │
│  │  │ Rule CRUD  │ │ User DB  │ │ Blacklist  │  │        │
│  │  │ (manage    │ │ Sync Orch. │ │ Manager    │  │        │
│  │  │  access    │ │ (push to   │ │ (priority  │  │        │
│  │  │  rules)    │ │  devices)  │ │  push)     │  │        │
│  │  └────────────┘ └────────────┘ └────────────┘  │        │
│  └──────────────────────┬──────────────────────────┘        │
│                         │                                    │
│         ┌───────────────┼───────────────┐                   │
│         ▼               ▼               ▼                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Sync Pub   │  │ Event Log  │  │ Analytics  │            │
│  │ (MQTT cfg  │  │ Ingester   │  │ (aggregate │            │
│  │ to devices)│  │ (from NATS │  │  event logs│            │
│  │            │  │  access.log│  │  dashboards│            │
│  │            │  │  events)   │  │  reports)  │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────┐                                             │
│  │ Repository │ → TimescaleDB (access_events hypertable)    │
│  └────────────┘                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Microservices Design

### 2.1 Service Boundaries by Domain

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                        SERVICE BOUNDARY MAP                              ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  🧠 SMART DOMAIN                                                        ║
║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ║
║  │ ai-asst-svc │ │ anomaly-svc │ │ automate-svc│ │ report-svc  │       ║
║  │ Python      │ │ Python      │ │ Go          │ │ Python      │       ║
║  │ LLM proxy   │ │ ML anomaly  │ │ Rule engine │ │ Analytics + │       ║
║  │ NL commands │ │ detection   │ │ If-then-that│ │ dashboards  │       ║
║  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ║
║                                                                          ║
║  🔒 SECURE DOMAIN                                                       ║
║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ║
║  │ access-svc  │ │ video-svc   │ │ intercom-svc│ │ alarm-svc   │       ║
║  │ Go          │ │ Go          │ │ Go          │ │ Go          │       ║
║  │ Rule mgmt   │ │ Camera mgmt │ │ SIP calls   │ │ Intrusion   │       ║
║  │ + sync orch │ │ live/play   │ │ door station│ │ detection   │       ║
║  │ + analytics │ │ clip extract│ │ intercom    │ │ zone mgmt   │       ║
║  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ║
║  ┌─────────────┐                                                        ║
║  │ vision-svc  │                                                        ║
║  │ Python      │                                                        ║
║  │ Video AI    │                                                        ║
║  │ Face/LPR    │                                                        ║
║  └─────────────┘                                                        ║
║                                                                          ║
║  👤 MANAGE DOMAIN                                                       ║
║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                       ║
║  │identity-svc │ │ visitor-svc │ │ attend-svc  │                       ║
║  │ Go          │ │ Go          │ │ Go          │                       ║
║  │ People,     │ │ Pre-reg,    │ │ Clock-in,   │                       ║
║  │ credentials,│ │ check-in,   │ │ shifts,     │                       ║
║  │ HR sync,    │ │ badge, host │ │ overtime,   │                       ║
║  │ provisioning│ │ notify      │ │ leave sync  │                       ║
║  └─────────────┘ └─────────────┘ └─────────────┘                       ║
║                                                                          ║
║  🏢 OPERATE DOMAIN                                                      ║
║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ║
║  │ parking-svc │ │ booking-svc │ │ maint-svc   │ │ iot-svc     │       ║
║  │ Go          │ │ Go          │ │ Go          │ │ Go          │       ║
║  │ LPR, barrier│ │ Room/resrc  │ │ Work orders │ │ Sensors,    │       ║
║  │ space mgmt  │ │ calendar    │ │ preventive  │ │ energy,     │       ║
║  │ fees        │ │ sync        │ │ asset mgmt  │ │ environment │       ║
║  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ║
║  ┌─────────────┐ ┌─────────────┐                                        ║
║  │ patrol-svc  │ │ key-svc     │                                        ║
║  │ Go          │ │ Go          │                                        ║
║  │ Guard tour  │ │ Key cabinet │                                        ║
║  │ checkpoints │ │ checkout    │                                        ║
║  └─────────────┘ └─────────────┘                                        ║
║                                                                          ║
║  ⚙️ PLATFORM DOMAIN                                                     ║
║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ║
║  │ auth-svc    │ │ company-mgmt│ │ device-gw   │ │ notif-svc   │       ║
║  │ Go (v1)     │ │ (in auth-   │ │ Go          │ │ Go          │       ║
║  │ JWT, bcrypt │ │  svc)       │ │ Sync coord. │ │ Push, SMS,  │       ║
║  │ Refresh tok │ │ Company     │ │ Protocol    │ │ email,      │       ║
║  │ RBAC, roles │ │ CRUD+users  │ │ adapters    │ │ Telegram    │       ║
║  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ║
║  ┌─────────────┐                                                        ║
║  │ audit-svc   │                                                        ║
║  │ Go          │                                                        ║
║  │ Immutable   │                                                        ║
║  │ event log   │                                                        ║
║  └─────────────┘                                                        ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**Total: ~20 microservices** (deploy selectively based on licensed modules).

### 2.2 Service Communication Patterns

```
┌─────────────────────────────────────────────────────────────────────┐
│                  COMMUNICATION PATTERNS                              │
│                                                                      │
│  SYNCHRONOUS (Request-Response)                                      │
│  ─────────────────────────────                                       │
│  • Client → API Gateway → Service:  REST over HTTPS                  │
│  • Service → Service (internal):    gRPC over mTLS                   │
│  • Rule queries (< 50ms):           gRPC with Valkey cache            │
│                                                                      │
│  ASYNCHRONOUS (Event-Driven)                                         │
│  ──────────────────────────                                          │
│  • Domain events:     NATS JetStream (durable, at-least-once)        │
│  • IoT device events: EMQX MQTT → NATS bridge                       │
│  • Audit trail:       NATS → audit-svc (append-only log)             │
│  • Notifications:     NATS → notif-svc (fan-out)                     │
│  • Video analytics:   NATS → vision-svc (frame dispatch)             │
│                                                                      │
│  REAL-TIME (Push to Clients)                                         │
│  ──────────────────────────                                          │
│  • Web Console:       WebSocket via Traefik                          │
│  • Mobile Apps:       WebSocket + Push Notifications (FCM/APNs)      │
│  • Guard Station:     WebSocket (low-latency event stream)           │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐   gRPC    ┌──────────┐   NATS    ┌──────────┐
  │access-svc├──────────►│identity- │──────────►│ audit-svc│
  │          │           │  svc     │           │          │
  └─────┬────┘           └──────────┘           └──────────┘
        │                                             ▲
        │ NATS "access.granted"                       │
        └─────────────────────────────────────────────┘
              │                    │
              ▼                    ▼
        ┌──────────┐        ┌──────────┐
        │alert-svc │        │notif-svc │
        │(automate)│        │(push/sms)│
        └──────────┘        └──────────┘
```

### 2.3 Service Registry & Discovery

- **Docker Compose (on-prem):** DNS-based discovery via Docker internal DNS
- **Kubernetes (cloud/HA):** Kubernetes Service discovery + CoreDNS
- **Health checks:** Each service exposes `/healthz` (liveness) and `/readyz` (readiness)
- **Circuit breaker:** Go services use `sony/gobreaker` for fault isolation

---

## 3. API Design

### 3.1 RESTful API Structure

```
Base URL: https://{host}/api/v1

SECURE Domain:
  /api/v1/access/doors                  GET, POST
  /api/v1/access/doors/{id}             GET, PUT, DELETE
  /api/v1/access/doors/{id}/unlock      POST (command)
  /api/v1/access/doors/{id}/lock        POST (command)
  /api/v1/access/doors/{id}/events      GET (time-series query)
  /api/v1/access/rules                  GET, POST, PUT, DELETE
  /api/v1/access/credentials            GET, POST, PUT, DELETE
  /api/v1/video/cameras                 GET, POST
  /api/v1/video/cameras/{id}/stream     GET (returns WebRTC SDP)
  /api/v1/video/cameras/{id}/clips      GET, POST
  /api/v1/video/cameras/{id}/snapshot   GET
  /api/v1/alarms/zones                  GET, POST, PUT
  /api/v1/alarms/zones/{id}/arm        POST
  /api/v1/alarms/zones/{id}/disarm     POST
  /api/v1/intercom/calls                GET, POST
  /api/v1/intercom/stations             GET, POST

MANAGE Domain:
  /api/v1/identity/users              GET, POST, PUT, DELETE
  /api/v1/identity/users/{id}/credentials   GET, POST, DELETE
  /api/v1/identity/users/{id}/access        GET, PUT
  /api/v1/visitors                      GET, POST
  /api/v1/visitors/{id}/checkin         POST
  /api/v1/visitors/{id}/checkout        POST
  /api/v1/attendance/records            GET
  /api/v1/attendance/clockin            POST
  /api/v1/attendance/clockout           POST
  /api/v1/attendance/shifts             GET, POST, PUT, DELETE

OPERATE Domain:
  /api/v1/parking/vehicles              GET, POST
  /api/v1/parking/spaces                GET
  /api/v1/parking/sessions              GET
  /api/v1/bookings/rooms                GET, POST
  /api/v1/bookings/reservations         GET, POST, PUT, DELETE
  /api/v1/maintenance/workorders        GET, POST, PUT
  /api/v1/maintenance/assets            GET, POST
  /api/v1/iot/sensors                   GET
  /api/v1/iot/sensors/{id}/readings     GET (time-series)
  /api/v1/energy/consumption            GET (time-series)
  /api/v1/patrol/routes                 GET, POST
  /api/v1/patrol/tours                  GET, POST

SMART Domain:
  /api/v1/dashboard/widgets             GET, POST, PUT, DELETE
  /api/v1/analytics/{domain}/summary    GET
  /api/v1/automation/rules              GET, POST, PUT, DELETE
  /api/v1/ai/chat                       POST (streaming SSE)
  /api/v1/ai/commands                   POST

PLATFORM:
  /api/v1/auth/login                    POST (email+password → JWT)
  /api/v1/auth/refresh                  POST (refresh token rotation)
  /api/v1/auth/device-token             POST (issue device MQTT JWT)
  /api/v1/system/companies              GET, POST (system_admin only)
  /api/v1/system/companies/{id}         GET, PUT, DELETE
  /api/v1/users                         GET, POST, PUT, DELETE (company-scoped)
  /api/v1/webhooks                      GET, POST, PUT, DELETE
  /api/v1/audit/events                  GET (immutable log query)
  /api/v1/system/health                 GET
  /api/v1/system/devices                GET, POST
```

### 3.2 API Versioning

```
Strategy: URL path versioning (/api/v1/, /api/v2/)

Lifecycle:
  v1 (current)  →  v2 (new)  →  v1 deprecated (6 months)  →  v1 removed

Headers:
  X-API-Version: 1          (informational, path is authoritative)
  X-Deprecation: true       (set on deprecated endpoints)
  Sunset: Sat, 01 Jan 2027  (RFC 8594 sunset header)
```

### 3.3 Authentication (OAuth 2.0 / OpenID Connect)

```
┌──────────┐                    ┌──────────┐                 ┌──────────┐
│  Client  │  1. Auth Request   │  auth-svc│  2. Validate   │ Keycloak │
│  (Web/   │───────────────────►│  (Go)    │────────────────►│ (IdP)    │
│  Mobile) │                    │          │◄────────────────│          │
│          │◄───────────────────│          │  3. JWT tokens  │          │
│          │  4. Access Token   │          │                 │          │
└──────┬───┘   + Refresh Token  └──────────┘                 └──────────┘
       │
       │  5. API call with Bearer token
       ▼
┌──────────┐  6. Validate JWT   ┌──────────┐
│ Traefik  │───────────────────►│ auth-svc │
│ Gateway  │◄─── 7. OK + claims │ (verify) │
│          │                    └──────────┘
│          │  8. Forward to service with claims
└──────────┘

Token Structure (JWT claims):
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "roles": ["security_admin", "guard"],
  "permissions": ["door.unlock", "camera.view"],
  "sites": ["site-uuid-1", "site-uuid-2"],
  "exp": 1740000000,
  "iss": "duall-master"
}

Supported Flows:
  • Authorization Code + PKCE  — Web Console, Mobile Apps
  • Client Credentials         — Service-to-service, 3rd party integrations
  • Device Authorization       — Android Terminals, Guard Stations
  • SAML 2.0 bridge            — Enterprise SSO (via Keycloak)

MFA:
  • TOTP (Google Authenticator)
  • WebAuthn/FIDO2 (hardware keys)
  • SMS OTP (fallback)
```

### 3.4 Rate Limiting

```
Tier-based rate limits (per tenant, per API key):

  Tier       │ Requests/min │ Burst │ WebSocket connections
  ───────────┼──────────────┼───────┼─────────────────────
  Starter    │      600     │  100  │        10
  Professional│    3,000     │  500  │        50
  Enterprise │   15,000     │ 2,000 │       500
  Internal   │   Unlimited  │   —   │     Unlimited

Implementation:
  • Traefik rate limit middleware (token bucket algorithm)
  • Valkey-backed sliding window counter for distributed deployments
  • Response headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  • HTTP 429 with Retry-After header on limit exceeded
```

### 3.5 Webhook System

```
┌──────────┐  Event occurs   ┌──────────┐  Publish       ┌──────────┐
│ Service  │────────────────►│  NATS    │───────────────►│ webhook- │
│ (any)    │                 │ JetStream│                │ dispatcher│
└──────────┘                 └──────────┘                └─────┬────┘
                                                               │
                      ┌───── Retry with exponential backoff ───┤
                      │                                        │
                      ▼                                        ▼
               ┌──────────┐                             ┌──────────┐
               │ Dead      │  After 5 retries           │ Customer │
               │ Letter    │◄──────────────────────────│ Endpoint │
               │ Queue     │                            │ (HTTPS)  │
               └──────────┘                             └──────────┘

Webhook payload:
{
  "id": "evt_abc123",
  "type": "access.door.unlocked",
  "tenant_id": "t_xyz",
  "timestamp": "2026-02-19T01:00:00Z",
  "data": {
    "door_id": "door_001",
    "user_id": "person_123",
    "credential_type": "face",
    "direction": "entry"
  },
  "signature": "sha256=..."   // HMAC-SHA256 of payload
}

Supported event types:
  access.*           — door events, credential events
  visitor.*          — check-in, check-out, pre-registration
  alarm.*            — zone armed/disarmed, alarm triggered
  device.*           — online, offline, health change
  parking.*          — entry, exit, payment
  maintenance.*      — work order created, completed
  system.*           — tenant events, config changes
```

---

## 4. Data Architecture

### 4.1 Database Strategy: Database-per-Service with Shared Engine

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TimescaleDB Instance                              │
│                    (PostgreSQL 16 + Timescale)                       │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │  db_access  │ │ db_identity │ │ db_facility │ │  db_video   │  │
│  │  (schema)   │ │  (schema)   │ │  (schema)   │ │  (schema)   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │  db_visitor │ │ db_attend  │ │ db_parking  │ │  db_iot     │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│  │  db_audit   │ │ db_tenant  │ │ db_alert    │                  │
│  └─────────────┘ └─────────────┘ └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

Strategy:
  • Schema-per-service within a shared TimescaleDB instance
  • Each service has its own DB user with access ONLY to its schema
  • Cross-service queries: NEVER. Services communicate via gRPC/NATS
  • On-premise small: single TimescaleDB instance, separate schemas
  • Cloud/large: can split to separate DB instances per service group
```

### 4.2 TimescaleDB Schema Design

#### Access Events (Hypertable — time-series)

```sql
-- High-volume time-series: access event logs (received from devices, decisions made locally on-device)
CREATE TABLE access_events (
    id          UUID DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    time        TIMESTAMPTZ NOT NULL,
    door_id     UUID NOT NULL,
    user_id   UUID,
    credential  JSONB,          -- {"type":"face","reader_id":"..."}
    direction   TEXT,            -- 'entry' | 'exit'
    decision    TEXT NOT NULL,   -- 'granted' | 'denied' | 'forced'
    reason      TEXT,            -- denial reason if denied
    metadata    JSONB,           -- extra data (photo_ref, temperature, etc.)
    PRIMARY KEY (tenant_id, time, id)
);

SELECT create_hypertable('access_events', 'time',
    partitioning_column => 'tenant_id',
    number_partitions => 4
);

-- Compression after 7 days (saves ~90% storage)
ALTER TABLE access_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, door_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('access_events', INTERVAL '7 days');

-- Retention: drop raw data after 2 years
SELECT add_retention_policy('access_events', INTERVAL '2 years');

-- Continuous aggregate: hourly door traffic
CREATE MATERIALIZED VIEW door_traffic_hourly
WITH (timescaledb.continuous) AS
SELECT
    tenant_id,
    door_id,
    time_bucket('1 hour', time) AS bucket,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE decision = 'granted') AS granted,
    COUNT(*) FILTER (WHERE decision = 'denied') AS denied,
    COUNT(DISTINCT user_id) AS unique_persons
FROM access_events
GROUP BY tenant_id, door_id, bucket;

SELECT add_continuous_aggregate_policy('door_traffic_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

#### IoT Sensor Readings (Hypertable)

```sql
CREATE TABLE sensor_readings (
    tenant_id    UUID NOT NULL,
    time         TIMESTAMPTZ NOT NULL,
    sensor_id    UUID NOT NULL,
    sensor_type  TEXT NOT NULL,     -- 'temperature','humidity','co2','power'
    value        DOUBLE PRECISION NOT NULL,
    unit         TEXT NOT NULL,
    metadata     JSONB,
    PRIMARY KEY (tenant_id, time, sensor_id)
);

SELECT create_hypertable('sensor_readings', 'time',
    partitioning_column => 'tenant_id',
    number_partitions => 4
);

-- Continuous aggregate: 15-min energy rollup
CREATE MATERIALIZED VIEW energy_15min
WITH (timescaledb.continuous) AS
SELECT
    tenant_id,
    sensor_id,
    time_bucket('15 minutes', time) AS bucket,
    AVG(value) AS avg_power,
    MAX(value) AS peak_power,
    SUM(value) / 4.0 AS energy_kwh  -- 15min intervals
FROM sensor_readings
WHERE sensor_type = 'power'
GROUP BY tenant_id, sensor_id, bucket;
```

#### Core Relational Tables (Regular PostgreSQL)

```sql
-- Identity service schema
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    email        TEXT,
    phone        TEXT,
    department   TEXT,
    role_template_id UUID,
    status       TEXT DEFAULT 'active',  -- active, suspended, terminated
    photo_ref    TEXT,                    -- MinIO object reference
    metadata     JSONB,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_persons_tenant ON users(tenant_id);
CREATE INDEX idx_persons_email ON users(tenant_id, email);

-- Credentials (cards, biometrics, mobile)
CREATE TABLE credentials (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    user_id    UUID NOT NULL REFERENCES users(id),
    type         TEXT NOT NULL,     -- 'card','face','fingerprint','mobile','pin'
    value        TEXT NOT NULL,     -- encrypted card number, template ref, etc.
    status       TEXT DEFAULT 'active',
    valid_from   TIMESTAMPTZ,
    valid_until  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- Access rules
CREATE TABLE access_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    name         TEXT NOT NULL,
    door_ids     UUID[] NOT NULL,
    schedule_id  UUID,              -- time schedule reference
    user_groups UUID[],           -- which groups have this access
    anti_passback BOOLEAN DEFAULT false,
    priority     INT DEFAULT 0,
    enabled      BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Event Sourcing for Audit Trail

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AUDIT EVENT STORE                                │
│                                                                      │
│  Every admin/system action produces an immutable audit event.        │
│  Events are append-only — no updates, no deletes.                    │
│                                                                      │
│  ┌──────────┐    NATS "audit.*"    ┌──────────┐   append-only      │
│  │ Any      │─────────────────────►│audit-svc │──────────────►      │
│  │ Service  │                      │          │                      │
│  └──────────┘                      └──────────┘                      │
│                                                                      │
│  audit_events hypertable:                                            │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ time | tenant_id | actor_id | action | resource_type |   │       │
│  │      | resource_id | old_value (JSONB) | new_value      │       │
│  │      | ip_address | user_agent | correlation_id         │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                      │
│  Immutability enforced by:                                           │
│  • DB user has INSERT only (no UPDATE/DELETE) on audit tables        │
│  • Periodic SHA-256 chain hash to detect tampering                   │
│  • Replicated to separate storage for compliance                     │
│                                                                      │
│  Retention: 7 years (configurable per compliance requirement)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Real-Time Layer

### 5.1 Three-Tier Messaging Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  TIER 1: DEVICE ↔ PLATFORM (MQTT via EMQX)                         │
│  ════════════════════════════════════════                            │
│                                                                      │
│  ┌────────┐  MQTT 5.0   ┌──────────────────────────────┐           │
│  │Reader  │─────────────►│         EMQX Broker          │           │
│  │Sensor  │  QoS 1/2    │                              │           │
│  │Camera  │◄─────────────│  Topics:                     │           │
│  │Barrier │              │  dm/{tenant}/device/{id}/evt │           │
│  └────────┘              │  dm/{tenant}/device/{id}/cmd │           │
│                          │  dm/{tenant}/device/{id}/sta │           │
│                          │                              │           │
│                          │  Rule Engine:                 │           │
│                          │  MQTT → NATS bridge          │           │
│                          │  MQTT → TimescaleDB (raw)    │           │
│                          │  MQTT → Webhook (external)   │           │
│                          └──────────────┬───────────────┘           │
│                                         │                            │
│  TIER 2: SERVICE ↔ SERVICE (NATS JetStream)                        │
│  ══════════════════════════════════════════                          │
│                                         │                            │
│                          ┌──────────────▼───────────────┐           │
│                          │     NATS + JetStream          │           │
│                          │                              │           │
│                          │  Streams (durable):          │           │
│                          │  • ACCESS_EVENTS              │           │
│                          │  • DEVICE_STATUS              │           │
│                          │  • ALERTS                     │           │
│                          │  • AUDIT_LOG                  │           │
│                          │  • AUTOMATION_TRIGGERS        │           │
│                          │                              │           │
│                          │  Consumers (per service):    │           │
│                          │  • access-svc → ACCESS_EVENTS│           │
│                          │  • alert-svc → ALERTS        │           │
│                          │  • audit-svc → AUDIT_LOG     │           │
│                          │  • notif-svc → ALERTS        │           │
│                          └──────────────┬───────────────┘           │
│                                         │                            │
│  TIER 3: PLATFORM → CLIENT (WebSocket)                              │
│  ═════════════════════════════════════                               │
│                                         │                            │
│                          ┌──────────────▼───────────────┐           │
│                          │     WebSocket Gateway         │           │
│                          │     (Go service)              │           │
│                          │                              │           │
│                          │  Subscribes to NATS topics    │           │
│                          │  Filters by tenant + role     │           │
│                          │  Pushes to connected clients  │           │
│                          └──────────────┬───────────────┘           │
│                                         │                            │
│                          ┌──────┬───────┴───────┬──────┐            │
│                          ▼      ▼               ▼      ▼            │
│                       ┌─────┐┌─────┐       ┌─────┐┌─────┐          │
│                       │ Web ││Guard│       │Admin││Resid│          │
│                       │Cons.││Stn. │       │ App ││ App │          │
│                       └─────┘└─────┘       └─────┘└─────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 MQTT Topic Hierarchy

```
dm/{tenant_id}/
├── device/{device_id}/
│   ├── evt          # Device → Platform: events (door open, sensor reading)
│   ├── cmd          # Platform → Device: commands (unlock, reboot)
│   ├── sta          # Device → Platform: status (online, battery, health)
│   └── cfg          # Platform → Device: configuration updates
├── zone/{zone_id}/
│   ├── alarm        # Zone alarm state changes
│   └── occupancy    # Zone occupancy updates
└── emergency/
    └── broadcast    # Emergency messages to all devices in tenant
```

### 5.3 NATS Subject Hierarchy

```
dm.{tenant}.access.log.{door_id}         # Access event logs (from devices, decisions already made locally)
dm.{tenant}.access.sync.{device_id}      # Access rule/user sync events
dm.{tenant}.device.status.{device_id}    # Device status changes
dm.{tenant}.alert.{severity}             # Alerts (critical/warning/info)
dm.{tenant}.automation.trigger            # Automation rule triggers
dm.{tenant}.visitor.{action}              # Visitor events
dm.{tenant}.parking.{action}              # Parking events
dm.audit.{tenant}.{service}               # Audit events (all services)
dm.internal.{service}.{action}            # Internal service communication
```

---

## 6. Video Pipeline

### 6.1 End-to-End Video Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VIDEO PIPELINE                                │
│                                                                      │
│  ┌────────┐  RTSP    ┌──────────────────────────────────────────┐   │
│  │IP Cam 1│─────────►│                                          │   │
│  │(H.264) │          │            go2rtc                        │   │
│  └────────┘          │                                          │   │
│  ┌────────┐  RTSP    │  Per-camera stream management:           │   │
│  │IP Cam 2│─────────►│  • RTSP ingest (pull from cameras)       │   │
│  │(H.265) │          │  • WebRTC output (browser/mobile)        │   │
│  └────────┘          │  • HLS output (playback, fallback)       │   │
│  ┌────────┐  ONVIF   │  • RTSP re-stream (to NVR/AI)           │   │
│  │NVR     │─────────►│  • Snapshot API                          │   │
│  │        │          │  • No transcoding (passthrough where     │   │
│  └────────┘          │    possible — saves CPU)                  │   │
│                      │                                          │   │
│                      └──────┬──────────┬──────────┬─────────────┘   │
│                             │          │          │                   │
│                    WebRTC   │   RTSP   │    HLS   │                  │
│                             │          │          │                   │
│                    ┌────────▼──┐  ┌────▼────┐  ┌─▼─────────────┐   │
│                    │ Browser / │  │vision-  │  │  Recording    │   │
│                    │ Mobile    │  │svc (AI) │  │  Service      │   │
│                    │ Live View │  │ Frame   │  │  Event clips  │   │
│                    └───────────┘  │ grab +  │  │  → MinIO      │   │
│                                   │ ONNX    │  └───────────────┘   │
│                                   └─────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Video Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                   video-svc (Go)                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Camera Manager                                │   │
│  │ • ONVIF discovery & registration              │   │
│  │ • PTZ control                                 │   │
│  │ • Health monitoring (stream status, FPS)       │   │
│  │ • Credential management (per camera)           │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ go2rtc (embedded as Go library)               │   │
│  │ • RTSP → WebRTC (ICE/STUN/TURN)              │   │
│  │ • RTSP → HLS (for playback / fallback)        │   │
│  │ • Sub-stream selection (main vs sub)           │   │
│  │ • Multi-viewer: single RTSP pull, N outputs    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Clip Extractor                                │   │
│  │ • Subscribes to NATS access/alarm events      │   │
│  │ • Pulls pre/post-event video from NVR (RTSP)  │   │
│  │ • Saves MP4 clips to MinIO                    │   │
│  │ • Links clip reference to event in DB          │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Recording Status Monitor                      │   │
│  │ • Polls NVR recording status via ONVIF         │   │
│  │ • Storage usage alerts                         │   │
│  │ • NVR health dashboard data                    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 6.3 WebRTC Signaling Flow

```
  Client (Browser)                video-svc               go2rtc         Camera
       │                              │                      │              │
       │  1. GET /cameras/{id}/stream │                      │              │
       │─────────────────────────────►│                      │              │
       │                              │  2. Ensure RTSP pull │              │
       │                              │─────────────────────►│──RTSP GET───►│
       │                              │                      │◄──RTSP 200──│
       │  3. WebRTC Offer (SDP)       │                      │              │
       │─────────────────────────────►│─────────────────────►│              │
       │                              │  4. WebRTC Answer     │              │
       │◄─────────────────────────────│◄─────────────────────│              │
       │                              │                      │              │
       │  5. ICE candidates exchange  │                      │              │
       │◄────────────────────────────►│◄────────────────────►│              │
       │                              │                      │              │
       │  6. Direct RTP media flow    │                      │              │
       │◄═══════════════════════════════════════════════════►│              │
       │  (H.264/H.265 passthrough — no server transcoding)  │              │
```

### 6.4 Multi-Camera Grid Performance

```
Strategy for 16+ simultaneous streams in browser:
  • Use sub-streams (CIF/D1 resolution) for grid view
  • Switch to main stream on camera select / fullscreen
  • WebRTC preferred (< 500ms latency)
  • HLS fallback for networks blocking UDP
  • go2rtc handles single RTSP pull → multiple WebRTC viewers
  • Estimated bandwidth: ~0.5 Mbps per sub-stream × 16 = 8 Mbps
```

---

## 7. AI/ML Pipeline

### 7.1 Overall AI Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI/ML PIPELINE                               │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ AI Assistant (ai-asst-svc — Python/FastAPI)                   │  │
│  │                                                               │  │
│  │  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐    │  │
│  │  │ NL Parser│───►│ Intent +     │───►│ Action Executor  │    │  │
│  │  │ (LLM)   │    │ Entity       │    │ (gRPC to services│    │  │
│  │  │         │    │ Extraction   │    │  with RBAC check) │    │  │
│  │  └──────────┘    └──────────────┘    └──────────────────┘    │  │
│  │       │                                                       │  │
│  │       ▼                                                       │  │
│  │  ┌──────────────────────┐                                    │  │
│  │  │ Ollama / vLLM        │  Models: Qwen2.5 7B/14B           │  │
│  │  │ (On-premise LLM)     │  Function calling for commands     │  │
│  │  │ OpenAI-compatible API│  RAG over building docs/manuals    │  │
│  │  └──────────────────────┘                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Video Analytics (vision-svc — Python/FastAPI)                 │  │
│  │                                                               │  │
│  │  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐    │  │
│  │  │ Frame    │───►│ ONNX Runtime │───►│ Post-Processing  │    │  │
│  │  │ Grabber  │    │              │    │ & Event Publish  │    │  │
│  │  │ (RTSP/   │    │ Providers:   │    │ (NATS)           │    │  │
│  │  │  go2rtc) │    │ • CPU (default)│  └──────────────────┘    │  │
│  │  └──────────┘    │ • OpenVINO   │                            │  │
│  │                  │ • TensorRT   │    Models:                  │  │
│  │                  └──────────────┘    • YOLOv8 (objects)       │  │
│  │                                      • InsightFace (faces)    │  │
│  │                                      • PaddleOCR (LPR)        │  │
│  │                                      • Custom (behavior)      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Anomaly Detection (anomaly-svc — Python/FastAPI)              │  │
│  │                                                               │  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐  │  │
│  │  │ Feature      │───►│ ML Models    │───►│ Alert          │  │  │
│  │  │ Engineering  │    │              │    │ Generator      │  │  │
│  │  │ (from NATS   │    │ • Isolation  │    │ (NATS publish) │  │  │
│  │  │  event stream│    │   Forest     │    └────────────────┘  │  │
│  │  │  + TimescaleDB│   │ • LSTM       │                        │  │
│  │  └──────────────┘    │ • PyOD       │    Detects:            │  │
│  │                      └──────────────┘    • Unusual access    │  │
│  │                                           • Off-hours entry   │  │
│  │                                           • Frequency spikes  │  │
│  │                                           • Device anomalies  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 AI Assistant — Function Calling Flow

```
User: "Who entered Building A after 10pm last night?"

  ┌──────────┐  1. Chat message   ┌──────────┐
  │ Client   │───────────────────►│ai-asst-  │
  │          │                    │svc       │
  └──────────┘                    └─────┬────┘
                                        │ 2. Prompt + function defs
                                        ▼
                                  ┌──────────┐
                                  │ Ollama   │
                                  │ Qwen2.5  │
                                  └─────┬────┘
                                        │ 3. Function call:
                                        │    query_access_events(
                                        │      building="A",
                                        │      after="22:00",
                                        │      date="yesterday"
                                        │    )
                                        ▼
                                  ┌──────────┐
                                  │access-svc│  4. gRPC query
                                  │(via gRPC)│     (RBAC-filtered)
                                  └─────┬────┘
                                        │ 5. Results
                                        ▼
                                  ┌──────────┐
                                  │ Ollama   │  6. Natural language response
                                  │ Qwen2.5  │
                                  └─────┬────┘
                                        │
                                        ▼
                                  "3 people entered Building A after
                                   10pm: John (22:15, Door B1-Main),
                                   Sara (23:02, Door B1-Side), ..."
```

### 7.3 Video Analytics Pipeline Detail

```
                    ┌──────────────────────────────┐
                    │        vision-svc             │
                    │                              │
  Camera RTSP ─────►│  Frame Grabber               │
  (via go2rtc       │  • 2-5 FPS per camera        │
   sub-stream)      │  • Configurable per camera    │
                    │  • Skip frames on CPU load    │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │ Detection Pipeline     │  │
                    │  │                        │  │
                    │  │  Frame                 │  │
                    │  │    │                   │  │
                    │  │    ├─► YOLOv8n (obj)   │  │
                    │  │    │   user, vehicle  │  │
                    │  │    │   bag, weapon      │  │
                    │  │    │                   │  │
                    │  │    ├─► InsightFace     │  │
                    │  │    │   (if user ROI) │  │
                    │  │    │   face match      │  │
                    │  │    │                   │  │
                    │  │    └─► PaddleOCR       │  │
                    │  │        (if vehicle ROI) │  │
                    │  │        license plate    │  │
                    │  └────────────────────────┘  │
                    │                              │
                    │  Post-process:                │
                    │  • Object tracking (DeepSORT) │
                    │  • Event dedup (same user)  │
                    │  • Confidence threshold        │
                    │  • Publish to NATS             │
                    └──────────────────────────────┘

Hardware requirements (per camera):
  CPU-only (Intel i7):  ~2-3 FPS per camera, max ~8 cameras
  NVIDIA GPU (RTX 3060): ~15-20 FPS per camera, max ~32 cameras
  Intel iGPU (OpenVINO): ~5-8 FPS per camera, max ~16 cameras
```

---

## 8. Device Integration Layer

### 8.1 Protocol Adapter Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     device-gateway (Go)                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Adapter Manager                              │ │
│  │  • Loads protocol adapters as Go plugins or built-in            │ │
│  │  • Routes commands from services to correct adapter             │ │
│  │  • Translates device events to unified NATS events              │ │
│  │  • Manages device connections, reconnection, health             │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           │                                          │
│  ┌────────────────────────┼───────────────────────────────────────┐ │
│  │                   PROTOCOL ADAPTERS                             │ │
│  │                        │                                        │ │
│  │  ┌─────────┐  ┌───────┴──┐  ┌──────────┐  ┌──────────┐       │ │
│  │  │ ONVIF   │  │ OSDP     │  │ Wiegand  │  │ RS-485   │       │ │
│  │  │ Adapter │  │ Adapter  │  │ Adapter  │  │ Adapter  │       │ │
│  │  │         │  │          │  │          │  │          │       │ │
│  │  │ Camera  │  │ Modern   │  │ Legacy   │  │ Legacy   │       │ │
│  │  │ NVR     │  │ readers  │  │ readers  │  │ contrlrs │       │ │
│  │  │ PTZ     │  │ encrypted│  │ (26/34   │  │ barriers │       │ │
│  │  │ events  │  │ bidirect │  │  bit)    │  │ lifts    │       │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────────┘       │ │
│  │                                                                │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │ │
│  │  │ SIP     │  │ Zigbee   │  │ BACnet   │  │ Modbus   │       │ │
│  │  │ Adapter │  │ Adapter  │  │ Adapter  │  │ Adapter  │       │ │
│  │  │         │  │          │  │          │  │          │       │ │
│  │  │ Intercom│  │ IoT      │  │ HVAC     │  │ Energy   │       │ │
│  │  │ door stn│  │ sensors  │  │ lighting │  │ meters   │       │ │
│  │  │ PBX     │  │ locks    │  │ BMS      │  │ PLCs     │       │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────────┘       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Unified Device Model:                                               │
│  {                                                                   │
│    "device_id": "uuid",                                             │
│    "tenant_id": "uuid",                                             │
│    "type": "reader|camera|sensor|barrier|intercom|meter",           │
│    "protocol": "onvif|osdp|wiegand|rs485|sip|zigbee|bacnet|modbus",│
│    "status": "online|offline|error",                                │
│    "capabilities": ["unlock","lock","ptz","snapshot"],              │
│    "connection": { "host":"...", "port":..., "params":{} },         │
│    "last_seen": "2026-02-19T01:00:00Z"                              │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Device Communication Flow

```
  COMMAND FLOW (server → device, for remote commands only):
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │ Service  │  gRPC   │ device-  │ Protocol│ Physical │
  │ (e.g.    │────────►│ gateway  │────────►│ Device   │
  │ access)  │         │ (sync    │         │          │
  │          │         │ coord.)  │         │ Terminal │
  │ "unlock  │         │ Translates│        │ Reader/  │
  │  door X" │         │ to device │        │ Camera   │
  └──────────┘         │ protocol  │        └──────────┘
                       └──────────┘

  SYNC FLOW (server → device, pushes rules/user DB):
  access-svc → device-gateway → MQTT cfg topics → Device (stores in local SQLite)

  EVENT FLOW (device → server, logs only — NOT decision requests):
  Physical Device → MQTT (EMQX) → NATS → services (for dashboards/audit)
```

### 8.3 Protocol Details

| Protocol | Transport | Use Case | Notes |
|----------|-----------|----------|-------|
| **ONVIF** | HTTP/SOAP + RTSP | IP cameras, NVRs | Profile S (streaming), Profile T (analytics), Profile G (recording) |
| **OSDP v2** | RS-485 serial | Modern readers | Encrypted (AES-128), bidirectional, SIA standard |
| **Wiegand** | Parallel wires | Legacy readers | 26/34-bit, unencrypted, receive-only — via RS-485 controller |
| **SIP** | UDP/TCP | Video intercom | RFC 3261, integrate with PBX, video calls |
| **Zigbee 3.0** | IEEE 802.15.4 | IoT sensors, smart locks | Via Zigbee coordinator (e.g., CC2652) |
| **BACnet/IP** | UDP/IP | HVAC, lighting, BMS | ASHRAE standard, read/write points |
| **Modbus TCP** | TCP/IP | Energy meters, PLCs | Register-based, simple but effective |
| **RS-485** | Serial | Controllers, barriers, lifts | Custom protocols per manufacturer |
| **MQTT** | TCP/TLS | Native IoT devices | Devices that speak MQTT directly |

---

## 9. Multi-Tenancy

### 9.1 Tenant Isolation Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANCY ARCHITECTURE                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Deployment Mode      │ Isolation Level    │ Use Case           │  │
│  ├───────────────────────┼────────────────────┼────────────────────┤  │
│  │ On-premise            │ Single tenant      │ Govt, military,    │  │
│  │ (dedicated)           │ (full isolation)   │ large enterprise   │  │
│  ├───────────────────────┼────────────────────┼────────────────────┤  │
│  │ Cloud SaaS            │ Shared infra,      │ SMB, residential,  │  │
│  │ (shared)              │ data-level isolate │ commercial RE      │  │
│  ├───────────────────────┼────────────────────┼────────────────────┤  │
│  │ Hybrid                │ Compute on-prem,   │ Enterprise wanting │  │
│  │                       │ mgmt in cloud      │ data sovereignty   │  │
│  └───────────────────────┴────────────────────┴────────────────────┘  │
│                                                                      │
│  SaaS Data Isolation (shared infrastructure):                        │
│                                                                      │
│  ┌──────────────────────────────────────────┐                       │
│  │           TimescaleDB                     │                       │
│  │                                          │                       │
│  │  Every table has tenant_id column         │                       │
│  │  Row-Level Security (RLS) enforced:       │                       │
│  │                                          │                       │
│  │  CREATE POLICY tenant_isolation           │                       │
│  │    ON access_events                       │                       │
│  │    USING (tenant_id = current_setting(    │                       │
│  │      'app.current_tenant')::uuid);        │                       │
│  │                                          │                       │
│  │  SET LOCAL app.current_tenant = 'uuid';  │                       │
│  │  -- Set per-connection by service code    │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                      │
│  ┌──────────────────────────────────────────┐                       │
│  │           NATS JetStream                  │                       │
│  │                                          │                       │
│  │  Subject hierarchy includes tenant_id:    │                       │
│  │  dm.{tenant_id}.access.event.*            │                       │
│  │                                          │                       │
│  │  Consumers filter by tenant subject       │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                      │
│  ┌──────────────────────────────────────────┐                       │
│  │           MinIO                           │                       │
│  │                                          │                       │
│  │  Bucket per tenant:                       │                       │
│  │  /{tenant_id}/clips/                      │                       │
│  │  /{tenant_id}/photos/                     │                       │
│  │  /{tenant_id}/documents/                  │                       │
│  │                                          │                       │
│  │  IAM policies restrict bucket access      │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                      │
│  ┌──────────────────────────────────────────┐                       │
│  │           Valkey                          │                       │
│  │                                          │                       │
│  │  Key prefix: {tenant_id}:cache:...        │                       │
│  │  Logical DB separation not needed         │                       │
│  │  (prefix is sufficient)                   │                       │
│  └──────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Tenant Lifecycle

```
Onboarding:
  1. tenant-svc creates tenant record
  2. Keycloak realm or client created for tenant
  3. RLS policies automatically apply (tenant_id column)
  4. MinIO bucket created
  5. EMQX ACLs configured for tenant MQTT topics
  6. Default admin user created, welcome email sent

Data partitioning (TimescaleDB):
  • Hypertables partitioned by time AND tenant_id
  • Queries always include tenant_id (index-first access)
  • Continuous aggregates respect tenant boundaries
  • Compression segments by tenant for efficient queries
```

---

## 10. Deployment Architecture

### 10.1 On-Premise — Docker Compose (Single Server)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   SINGLE SERVER DEPLOYMENT                           │
│                   (Docker Compose)                                    │
│                                                                      │
│   Hardware: 8+ cores, 32GB+ RAM, 1TB+ SSD                          │
│   OS: Ubuntu 22.04 LTS or RHEL 9                                   │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ docker-compose.yml                                           │   │
│   │                                                              │   │
│   │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│   │ │ traefik  │ │timescale │ │  valkey  │ │  emqx    │       │   │
│   │ │ :443     │ │ db       │ │  :6379   │ │  :1883   │       │   │
│   │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│   │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│   │ │  nats    │ │  minio   │ │ keycloak │ │  go2rtc  │       │   │
│   │ │  :4222   │ │  :9000   │ │  :8080   │ │  :1984   │       │   │
│   │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│   │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│   │ │access-svc│ │identity- │ │visitor-  │ │video-svc │       │   │
│   │ │          │ │svc       │ │svc       │ │          │       │   │
│   │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│   │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│   │ │alert-svc │ │device-gw │ │notif-svc │ │audit-svc │       │   │
│   │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│   │ ┌──────────┐ ┌──────────┐ ┌──────────┐                    │   │
│   │ │ai-asst   │ │vision-svc│ │anomaly-  │  (optional AI)     │   │
│   │ │+ ollama  │ │+ onnxrt  │ │svc       │                    │   │
│   │ └──────────┘ └──────────┘ └──────────┘                    │   │
│   │                                                              │   │
│   │ ┌──────────┐ ┌──────────┐ ┌──────────┐  (observability)   │   │
│   │ │prometheus│ │ grafana  │ │  loki    │                    │   │
│   │ └──────────┘ └──────────┘ └──────────┘                    │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   Volumes:                                                           │
│   /data/timescaledb    — database storage                            │
│   /data/minio          — object storage (clips, photos)              │
│   /data/nats           — JetStream persistence                       │
│   /data/emqx           — MQTT session persistence                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 On-Premise HA — K3s (Multi-Node)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   K3s HA DEPLOYMENT                                  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  K3s Server  │  │  K3s Server  │  │  K3s Server  │              │
│  │  (Control)   │  │  (Control)   │  │  (Control)   │              │
│  │  + etcd      │◄─►  + etcd      │◄─►  + etcd      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│  ┌──────┴──────────────────┴──────────────────┴──────┐              │
│  │              Virtual IP (Keepalived)                │              │
│  └───────────────────────┬────────────────────────────┘              │
│                          │                                           │
│  ┌───────────────────────┼────────────────────────────┐              │
│  │  K3s Worker Nodes (3-10 nodes)                      │              │
│  │                                                     │              │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │              │
│  │  │Worker 1 │ │Worker 2 │ │Worker 3 │ │Worker N │  │              │
│  │  │App pods │ │App pods │ │DB/Infra │ │GPU (AI) │  │              │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │              │
│  └─────────────────────────────────────────────────────┘              │
│                                                                      │
│  Storage: Longhorn (distributed block storage for K3s)               │
│  Ingress: Traefik (bundled with K3s)                                 │
│  DNS: CoreDNS (bundled with K3s)                                     │
│  Monitoring: Prometheus + Grafana (Helm charts)                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.3 Cloud SaaS — Managed Kubernetes

```
┌─────────────────────────────────────────────────────────────────────┐
│                   CLOUD SaaS (AWS EKS / GKE)                        │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  Region: ap-south-1 │  │  Region: ap-south-2 │   (DR)          │
│  │  (Primary)          │  │  (Standby)           │                  │
│  │                     │  │                      │                  │
│  │  ┌───────────────┐  │  │  ┌───────────────┐   │                  │
│  │  │ EKS Cluster   │  │  │  │ EKS Cluster   │   │                  │
│  │  │ 3 AZs         │  │  │  │ (standby)     │   │                  │
│  │  └───────────────┘  │  │  └───────────────┘   │                  │
│  │                     │  │                      │                  │
│  │  ┌───────────────┐  │  │                      │                  │
│  │  │ RDS (PG +     │──┼──┼──► Cross-region     │                  │
│  │  │ TimescaleDB)  │  │  │    replication       │                  │
│  │  └───────────────┘  │  │                      │                  │
│  │                     │  │                      │                  │
│  │  ┌───────────────┐  │  │                      │                  │
│  │  │ ElastiCache   │  │  │                      │                  │
│  │  │ (Valkey)      │  │  │                      │                  │
│  │  └───────────────┘  │  │                      │                  │
│  │                     │  │                      │                  │
│  │  ┌───────────────┐  │  │                      │                  │
│  │  │ S3 (replace   │  │  │                      │                  │
│  │  │  MinIO)       │  │  │                      │                  │
│  │  └───────────────┘  │  │                      │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│                                                                      │
│  CI/CD: GitHub Actions → ECR → ArgoCD → EKS                         │
│  CDN: CloudFront (static assets, React app)                          │
│  DNS: Route53 (multi-region failover)                                │
│  Secrets: AWS Secrets Manager / HashiCorp Vault                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.4 Hybrid Deployment

```
┌──────────────────────────┐          ┌──────────────────────────┐
│   CUSTOMER SITE          │          │   DUALI CLOUD            │
│   (On-Premise)           │          │   (SaaS)                 │
│                          │  VPN /   │                          │
│  ┌────────────────────┐  │  WireGrd │  ┌────────────────────┐ │
│  │ device-gateway     │  │◄────────►│  │ Cloud Management   │ │
│  │ access-svc         │  │  Tunnel  │  │ Console            │ │
│  │ video-svc + go2rtc │  │          │  │                    │ │
│  │ EMQX (local MQTT)  │  │          │  │ tenant-svc         │ │
│  │ TimescaleDB (local)│  │          │  │ analytics (Cloud)  │ │
│  │ Valkey (local)     │  │          │  │ AI services (opt.) │ │
│  └────────────────────┘  │          │  │ Backup storage     │ │
│                          │          │  └────────────────────┘ │
│  Data stays on-premise.  │          │  Cloud provides:        │
│  Access decisions local. │          │  • Remote management    │
│  Video stays local.      │          │  • Aggregated analytics │
│                          │          │  • Software updates     │
│                          │          │  • Backup & DR          │
└──────────────────────────┘          └──────────────────────────┘
```

---

## 11. Security Architecture

### 11.1 Zero-Trust Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ZERO-TRUST ARCHITECTURE                         │
│                                                                      │
│  Principle: Never trust, always verify. Every request authenticated. │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 1. IDENTITY VERIFICATION                                     │    │
│  │    • Every API call carries JWT with tenant + role claims     │    │
│  │    • Service-to-service: mTLS + service identity tokens       │    │
│  │    • Device connections: X.509 certificates or pre-shared key │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 2. LEAST PRIVILEGE                                           │    │
│  │    • RBAC with granular permissions (door.unlock, camera.view)│    │
│  │    • DB users: service-specific, schema-restricted            │    │
│  │    • MQTT ACLs: tenant-scoped topic access                    │    │
│  │    • MinIO policies: tenant-scoped bucket access              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 3. ENCRYPTION                                                │    │
│  │    • In transit: TLS 1.3 everywhere (API, MQTT, gRPC, NATS)  │    │
│  │    • At rest: AES-256 (database TDE, MinIO SSE)               │    │
│  │    • Credentials: Argon2id hashing for PINs/passwords         │    │
│  │    • Card numbers: AES-256-GCM encrypted in database          │    │
│  │    • Biometric templates: encrypted, never stored as images    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 4. NETWORK SEGMENTATION                                      │    │
│  │                                                              │    │
│  │    ┌──────────┐   ┌──────────┐   ┌──────────┐              │    │
│  │    │ DMZ      │   │ App      │   │ Data     │              │    │
│  │    │          │   │ Network  │   │ Network  │              │    │
│  │    │ Traefik  │──►│ Services │──►│ DBs      │              │    │
│  │    │ (public) │   │ NATS,EMQX│   │ Valkey   │              │    │
│  │    └──────────┘   └──────────┘   │ MinIO    │              │    │
│  │                                  └──────────┘              │    │
│  │    Device network isolated. No direct DB access from DMZ.  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.2 RBAC Model

```
Roles (hierarchical):
  super_admin          — Duali staff, system-wide
  tenant_admin         — Tenant owner, full tenant access
  security_admin       — Security configuration
  security_operator    — Guard / operator (monitor + respond)
  hr_admin             — People management
  facility_admin       — Facility operations
  reception            — Visitor management
  resident             — Self-service (mobile app)
  api_integration      — Machine-to-machine (limited scope)

Permission structure:
  {domain}.{resource}.{action}

  access.door.view           access.door.unlock
  access.door.configure      access.rule.manage
  video.camera.view          video.camera.ptz
  video.camera.playback      video.clip.export
  identity.user.view       identity.user.manage
  identity.credential.issue  identity.credential.revoke
  visitor.manage             visitor.approve
  alarm.zone.view            alarm.zone.arm
  parking.manage             parking.view
  report.view                report.export
  system.configure           system.audit.view
  ai.assistant.use           ai.assistant.admin
  automation.rule.manage     automation.rule.view
```

### 11.3 Audit Logging

```
Every significant action produces an immutable audit event:

  • Admin configuration changes (who changed what, old → new value)
  • Access control decisions (every grant/deny)
  • Door commands (manual unlock/lock, by whom)
  • User lifecycle (create, modify, suspend, terminate)
  • Credential management (issue, revoke)
  • System access (login, logout, failed login)
  • Emergency actions (lockdown, fire mode)
  • Data export/reports (who exported what data)
  • API key usage (which integration accessed what)

Storage:
  • TimescaleDB hypertable (fast query, continuous aggregates)
  • SHA-256 chain hash every 1000 events (tamper detection)
  • Retention: 7 years minimum (compliance)
  • Replicated to separate storage (MinIO/S3 for cold archive)
```

---

## 12. High Availability

### 12.1 HA Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   HIGH AVAILABILITY DESIGN                           │
│                                                                      │
│  Component          │ HA Strategy              │ RTO    │ RPO       │
│  ───────────────────┼──────────────────────────┼────────┼────────── │
│  Go Services        │ 2+ replicas, K8s restart │ < 30s  │ 0 (sless)│
│  TimescaleDB        │ Streaming repl + Patroni │ < 60s  │ ~0       │
│  Valkey             │ Sentinel (3 nodes)       │ < 30s  │ ~0       │
│  EMQX              │ Cluster mode (3 nodes)   │ < 10s  │ 0        │
│  NATS              │ Cluster (3 nodes)        │ < 5s   │ 0        │
│  MinIO             │ Erasure coding (4 nodes) │ 0      │ 0        │
│  Traefik           │ Active-standby           │ < 10s  │ N/A      │
│  Keycloak          │ 2+ replicas              │ < 30s  │ 0        │
│  Ollama/vLLM       │ Single (non-critical)    │ < 5min │ N/A      │
└─────────────────────────────────────────────────────────────────────┘

Critical path (access control decision):
  Reader → device-gw → access-svc → Valkey (cached rules) → device-gw → Door

  If Valkey down: fallback to TimescaleDB query
  If TimescaleDB down: access-svc has in-memory rule cache (30s TTL)
  If access-svc down: device-gw local decision cache (emergency mode)
  If network down: controller offline mode (stored credentials on device)
```

### 12.2 Backup Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKUP STRATEGY                                  │
│                                                                      │
│  TimescaleDB:                                                        │
│  • Continuous WAL archiving to MinIO/S3 (pgBackRest)                │
│  • Full backup: daily at 02:00 local time                           │
│  • Incremental: every 6 hours                                        │
│  • Retention: 30 days of point-in-time recovery                      │
│  • Monthly cold archive: compressed, encrypted, off-site             │
│                                                                      │
│  MinIO (video clips, photos):                                        │
│  • Erasure coding provides built-in redundancy                       │
│  • Cross-site replication for hybrid deployments                     │
│  • Lifecycle: move to cold tier after 90 days                        │
│                                                                      │
│  Configuration:                                                      │
│  • GitOps: all config in version control (ArgoCD)                   │
│  • Keycloak: realm export daily                                      │
│  • EMQX: config backup daily                                        │
│                                                                      │
│  Disaster Recovery:                                                  │
│  • On-premise: documented restore procedure, tested quarterly        │
│  • Cloud: cross-region standby, automated failover                   │
│  • Hybrid: cloud holds backup copy, can restore on-prem              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 13. Scalability

### 13.1 Horizontal Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SCALING DIMENSIONS                                 │
│                                                                      │
│  Small (1 building, 50 doors):                                       │
│  • Single server, Docker Compose                                     │
│  • 8 cores, 32GB RAM                                                 │
│  • All services on one host                                          │
│                                                                      │
│  Medium (5 buildings, 200 doors):                                    │
│  • 3-node K3s cluster                                                │
│  • Services replicated 2x                                            │
│  • Dedicated DB node                                                 │
│                                                                      │
│  Large (50 buildings, 2000 doors):                                   │
│  • 10+ node K8s cluster                                              │
│  • Services scaled by load (HPA)                                     │
│  • TimescaleDB multi-node                                            │
│  • ClickHouse for analytics                                          │
│  • Multiple EMQX nodes                                               │
│                                                                      │
│  SaaS (1000 tenants):                                                │
│  • Managed K8s (EKS/GKE)                                             │
│  • Auto-scaling (HPA + Cluster Autoscaler)                           │
│  • Managed database (RDS + TimescaleDB)                              │
│  • Global CDN                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.2 Scaling Per Component

```
  ┌──────────────┐
  │   Traefik    │  Horizontal: active-standby or K8s DaemonSet
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │  Go Services │  Horizontal: stateless, scale via K8s HPA
  │  (stateless) │  CPU target: 70% → scale up
  └──────┬───────┘  Each pod: ~20-50MB RAM
         │
  ┌──────▼───────┐
  │   Valkey     │  Vertical first, then Cluster mode (sharding)
  │              │  Hot data: access rules, session tokens
  └──────┬───────┘  Eviction: LRU, 1GB default allocation
         │
  ┌──────▼───────┐
  │ TimescaleDB  │  Vertical first (PG scales well vertically)
  │              │  Read replicas for report queries
  └──────┬───────┘  Continuous aggregates reduce query load
         │
  ┌──────▼───────┐
  │    NATS      │  Horizontal: clustered (3+ nodes)
  │              │  JetStream replication factor: 3
  └──────┬───────┘  Very lightweight, rarely the bottleneck
         │
  ┌──────▼───────┐
  │    EMQX      │  Horizontal: clustered, auto-balances connections
  │              │  1M+ connections per cluster
  └──────────────┘
```

### 13.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CACHING LAYERS                                   │
│                                                                      │
│  Layer 1: Client-side (React, Flutter)                               │
│  • API response cache (ETags, Cache-Control headers)                 │
│  • Flutter: Hive local DB for offline access rules                   │
│  • React: SWR / React Query with stale-while-revalidate             │
│                                                                      │
│  Layer 2: API Gateway (Traefik)                                      │
│  • Static asset caching (dashboard configs, translations)            │
│  • NOT for dynamic API responses (tenant-specific data)              │
│                                                                      │
│  Layer 3: Application (Valkey)                                       │
│  • Access rules per door: TTL 60s, invalidate on rule change         │
│  • User credentials: TTL 60s, invalidate on credential change      │
│  • Dashboard widget data: TTL 30s                                    │
│  • Session tokens: TTL = token expiry                                │
│  • Tenant config: TTL 300s                                           │
│  • Rate limit counters: sliding window in Valkey                     │
│                                                                      │
│  Layer 4: Database (TimescaleDB)                                     │
│  • Continuous aggregates (pre-computed time-series rollups)           │
│  • Materialized views for complex report queries                     │
│  • Connection pooling: PgBouncer (transaction mode)                  │
│                                                                      │
│  Cache Invalidation:                                                 │
│  • Event-driven: NATS event triggers Valkey DEL                      │
│  • Example: rule change → NATS "access.rule.updated"                 │
│    → access-svc invalidates Valkey cache for affected doors          │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.4 Performance Targets

```
  Metric                              │ Target        │ Method
  ────────────────────────────────────┼───────────────┼─────────────────
  Access decision latency             │ < 50ms p99    │ Valkey cache
  API response time                   │ < 200ms p95   │ Go + Valkey
  WebRTC live view startup            │ < 2s          │ go2rtc passthrough
  Dashboard initial load              │ < 3s          │ CDN + code split
  MQTT message delivery               │ < 100ms       │ EMQX cluster
  Event → UI notification             │ < 500ms       │ NATS → WebSocket
  AI Assistant response               │ < 5s          │ Ollama streaming
  Video analytics (per frame)         │ < 200ms       │ ONNX Runtime
  Concurrent WebSocket connections    │ 10,000+       │ Go + epoll
  MQTT concurrent devices             │ 100,000+      │ EMQX cluster
```

---

## Appendix A: Technology Stack Summary

| Layer | Technology | Version | License |
|-------|-----------|---------|---------|
| API Gateway | Traefik | 3.x | MIT |
| Backend (core) | Go | 1.22+ | BSD |
| Backend (AI) | Python / FastAPI | 3.12 / 0.110+ | MIT |
| Frontend | React + TypeScript | 18+ / 5+ | MIT |
| Mobile | Flutter | 3.x | BSD |
| Database | TimescaleDB (PostgreSQL) | 2.x (PG 16) | Apache 2.0 |
| Cache | Valkey | 8.x | BSD |
| MQTT Broker | EMQX | 5.x | Apache 2.0 |
| Event Bus | NATS + JetStream | 2.x | Apache 2.0 |
| Object Storage | MinIO | latest | AGPL / Commercial |
| Video Proxy | go2rtc | latest | MIT |
| LLM Inference | Ollama → vLLM | latest | MIT / Apache 2.0 |
| Vision AI | ONNX Runtime | 1.x | MIT |
| Auth / SSO | Keycloak | 24+ | Apache 2.0 |
| Monitoring | Prometheus + Grafana + Loki | latest | Apache 2.0 |
| Tracing | OpenTelemetry | latest | Apache 2.0 |
| Analytics DB | ClickHouse (Phase 3) | latest | Apache 2.0 |
| Container Orch. | Docker Compose / K3s / K8s | latest | Apache 2.0 |
| CI/CD | GitHub Actions + ArgoCD | latest | MIT / Apache 2.0 |

---

## Appendix B: Service Port Map (Development)

```
  Service         │ REST Port │ gRPC Port │ Notes
  ────────────────┼───────────┼───────────┼─────────────
  traefik         │ 443/80    │ —         │ Entry point
  auth-svc        │ 8001      │ 9001      │ + Keycloak :8080
  access-svc      │ 8002      │ 9002      │
  identity-svc    │ 8003      │ 9003      │
  visitor-svc     │ 8004      │ 9004      │
  video-svc       │ 8005      │ 9005      │ + go2rtc :1984
  alert-svc       │ 8006      │ 9006      │
  device-gw       │ 8007      │ 9007      │
  tenant-svc      │ 8008      │ 9008      │
  notif-svc       │ 8009      │ 9009      │
  audit-svc       │ 8010      │ 9010      │
  attend-svc      │ 8011      │ 9011      │
  parking-svc     │ 8012      │ 9012      │
  booking-svc     │ 8013      │ 9013      │
  maint-svc       │ 8014      │ 9014      │
  iot-svc         │ 8015      │ 9015      │
  patrol-svc      │ 8016      │ 9016      │
  ai-asst-svc     │ 8020      │ —         │ Python
  vision-svc      │ 8021      │ —         │ Python
  anomaly-svc     │ 8022      │ —         │ Python
  report-svc      │ 8023      │ —         │ Python
  ────────────────┼───────────┼───────────┼─────────────
  timescaledb     │ 5432      │ —         │
  valkey          │ 6379      │ —         │
  nats            │ 4222      │ —         │ +8222 (monitor)
  emqx            │ 1883      │ —         │ +8883 (TLS) +18083 (dashboard)
  minio           │ 9000      │ —         │ +9001 (console)
  ollama          │ 11434     │ —         │
  prometheus      │ 9090      │ —         │
  grafana         │ 3000      │ —         │
  loki            │ 3100      │ —         │
```

---

*This document feeds into detailed design specifications for each microservice.*  
*Next: API specifications (OpenAPI 3.1), database migration scripts, deployment manifests.*

---

*Document prepared by Architecture Team — February 2026*  
*Version 1.0 — Initial architecture design*
