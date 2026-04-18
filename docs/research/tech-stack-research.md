# Duall Master 3.0 — Technology Stack Research

**Date:** February 2026  
**Purpose:** Compare technology options for each platform component to inform architecture decisions  
**Kanban Task:** task-1771437297

---

## Table of Contents

1. [Competitor Technology Analysis](#1-competitor-technology-analysis)
2. [Backend Language/Framework](#2-backend-languageframework)
3. [Frontend Framework](#3-frontend-framework)
4. [Mobile Framework](#4-mobile-framework)
5. [Database](#5-database)
6. [Cache / Real-time](#6-cache--real-time)
7. [Message Broker](#7-message-broker)
8. [Video / Streaming](#8-video--streaming)
9. [AI/ML Stack](#9-aiml-stack)
10. [DevOps](#10-devops)
11. [API Gateway](#11-api-gateway)
12. [Recommended Stack Summary](#12-recommended-stack-summary)

---

## 1. Competitor Technology Analysis

Understanding what established players use helps validate or challenge our choices.

| Competitor | Category | Known Stack | Notes |
|-----------|----------|-------------|-------|
| **Genetec** (Security Center) | Enterprise unified security | **.NET/C#**, SQL Server, WPF desktop client | Hybrid-cloud SaaS moving to web; legacy Windows-centric; SDK in .NET |
| **Milestone** (XProtect) | VMS leader | **.NET/C#**, SQL Server, Windows-only | Recently added web client; very Windows-dependent |
| **Brivo** | Cloud access control | **Cloud-native** (AWS), microservices, likely Java/Node.js | Pure SaaS, mobile-first, REST API-driven |
| **Verkada** | Cloud video + access | **Cloud-native** (AWS), Go, React, ML pipelines | Edge AI on cameras, cloud management, modern stack |
| **Openpath** (Motorola) | Cloud access control | **Cloud-native**, likely Go/Node.js, React Native mobile | Acquired by Motorola; BLE-first mobile credentials |
| **Honeywell** (Pro-Watch) | Enterprise access | **C++/.NET**, Oracle/SQL Server | Legacy enterprise, slow to modernize |
| **Gallagher** | Enterprise security | **C++/Java**, proprietary protocols | NZ-based, strong in government sector |
| **ACRE/Feenics** | Cloud access | **Cloud-native** (Azure), .NET Core | Keep by Feenics is cloud-native |
| **Rhombus** | Cloud video | **Cloud-native**, modern web stack, edge AI | Similar to Verkada model |

**Key Takeaway:** Legacy players (Genetec, Milestone, Honeywell) are .NET/Windows. Modern disruptors (Verkada, Brivo, Openpath) are cloud-native with Go/Node.js, React, and edge AI. Duall Master 3.0 should follow the modern path but support on-premise deployment — a significant differentiator.

---

## 2. Backend Language/Framework

### Requirements
- Handle thousands of concurrent connections (door events, sensors, camera streams)
- Low latency for access control decisions (< 50ms)
- On-premise deployable (resource efficient)
- Microservices architecture
- Team can hire for it in Vietnam

| Criteria | **Go** | **Rust** | **Java (Spring Boot)** | **.NET 8** | **Node.js** | **Python (FastAPI)** |
|----------|--------|----------|----------------------|-----------|-------------|---------------------|
| **Performance** | ⭐⭐⭐⭐⭐ Excellent concurrency, goroutines | ⭐⭐⭐⭐⭐ Best raw performance, zero-cost abstractions | ⭐⭐⭐⭐ Very good with virtual threads (Java 21) | ⭐⭐⭐⭐ Excellent with AOT compilation | ⭐⭐⭐ Good for I/O, weak for CPU | ⭐⭐ Slow for CPU-bound, GIL issues |
| **Concurrency** | ⭐⭐⭐⭐⭐ Native goroutines, channels | ⭐⭐⭐⭐⭐ async/await, tokio | ⭐⭐⭐⭐ Virtual threads, reactive | ⭐⭐⭐⭐ async/await, Task | ⭐⭐⭐ Event loop, single-threaded | ⭐⭐⭐ asyncio |
| **Memory Usage** | ⭐⭐⭐⭐ Low (~20-50MB per service) | ⭐⭐⭐⭐⭐ Lowest (no GC) | ⭐⭐ High (JVM ~200MB+) | ⭐⭐⭐ Moderate (~80-150MB) | ⭐⭐⭐ Moderate (~50-100MB) | ⭐⭐⭐ Moderate |
| **Ecosystem (IoT/Security)** | ⭐⭐⭐⭐ Strong MQTT, gRPC, network libs | ⭐⭐⭐ Growing but smaller | ⭐⭐⭐⭐⭐ Massive ecosystem | ⭐⭐⭐⭐ Good ecosystem | ⭐⭐⭐⭐ Good for APIs, npm ecosystem | ⭐⭐⭐⭐ Excellent ML/AI libs |
| **Learning Curve** | ⭐⭐⭐⭐ Simple language, fast onboarding | ⭐⭐ Steep (borrow checker, lifetimes) | ⭐⭐⭐ Moderate (complex framework) | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Easy | ⭐⭐⭐⭐⭐ Easiest |
| **Hiring (Vietnam)** | ⭐⭐⭐ Growing, smaller pool | ⭐ Very hard to hire | ⭐⭐⭐⭐⭐ Largest pool | ⭐⭐⭐ Moderate pool | ⭐⭐⭐⭐ Large pool | ⭐⭐⭐⭐ Good pool |
| **Build/Deploy** | ⭐⭐⭐⭐⭐ Single binary, tiny containers | ⭐⭐⭐⭐⭐ Single binary | ⭐⭐ Fat JARs, slow startup | ⭐⭐⭐⭐ Good with AOT | ⭐⭐⭐ Needs runtime | ⭐⭐⭐ Needs runtime |
| **License** | BSD | MIT/Apache | Apache 2.0 (Spring) | MIT (.NET) | MIT | MIT |
| **Cost** | Free | Free | Free (Spring) / Paid (enterprise support) | Free | Free | Free |

### Analysis

**Go** is the strongest choice for core platform services:
- Built for exactly this workload (concurrent network services)
- Small binaries → excellent for on-premise deployment
- Used by Verkada, Docker, Kubernetes, Prometheus — proven in infra
- Reasonable hiring pool in Vietnam (growing fast)

**Python/FastAPI** is ideal as a secondary language for AI/ML services:
- Best ML ecosystem (PyTorch, transformers, scikit-learn)
- FastAPI is modern, fast enough for API services
- Keep AI/ML microservices in Python, everything else in Go

**Java/Spring Boot** is the safe enterprise choice but overkill for on-premise (heavy memory footprint).

### ✅ Recommendation
- **Primary:** Go (core platform services, device communication, real-time processing)
- **Secondary:** Python/FastAPI (AI/ML services, analytics, report generation)

---

## 3. Frontend Framework

### Requirements
- Complex real-time dashboards (live events, camera grids, floor plans)
- Drag-and-drop dashboard builder
- Multi-language (Vietnamese, English)
- Large component library needs (tables, charts, maps, video players)

| Criteria | **React** | **Vue 3** | **Angular** | **Svelte/SvelteKit** |
|----------|-----------|-----------|-------------|---------------------|
| **Performance** | ⭐⭐⭐⭐ Virtual DOM, good with optimization | ⭐⭐⭐⭐ Reactive, slightly faster than React | ⭐⭐⭐ Heavier framework | ⭐⭐⭐⭐⭐ Compile-time, smallest bundle |
| **Ecosystem** | ⭐⭐⭐⭐⭐ Largest — MUI, Ant Design, AG Grid, etc. | ⭐⭐⭐⭐ Good — Element Plus, Vuetify, PrimeVue | ⭐⭐⭐⭐ Good — Angular Material, PrimeNG | ⭐⭐ Small, fewer enterprise components |
| **Real-time/Dashboard** | ⭐⭐⭐⭐⭐ Grafana-like libs, react-grid-layout | ⭐⭐⭐⭐ Good options available | ⭐⭐⭐⭐ Good for complex enterprise UIs | ⭐⭐⭐ Fewer dashboard-specific libs |
| **Video Integration** | ⭐⭐⭐⭐⭐ hls.js, WebRTC, flv.js — mature | ⭐⭐⭐⭐ Same underlying libs | ⭐⭐⭐⭐ Same underlying libs | ⭐⭐⭐ Works but fewer wrappers |
| **Learning Curve** | ⭐⭐⭐⭐ Moderate (hooks, JSX) | ⭐⭐⭐⭐⭐ Easiest (Composition API is clean) | ⭐⭐ Steep (RxJS, decorators, DI) | ⭐⭐⭐⭐⭐ Very intuitive |
| **Hiring (Vietnam)** | ⭐⭐⭐⭐⭐ Most popular | ⭐⭐⭐⭐ Very popular in VN | ⭐⭐⭐ Less popular in VN | ⭐ Very hard to hire |
| **TypeScript** | ⭐⭐⭐⭐ Good support | ⭐⭐⭐⭐⭐ First-class in Vue 3 | ⭐⭐⭐⭐⭐ Built-in | ⭐⭐⭐⭐ Good support |
| **License** | MIT | MIT | MIT | MIT |

### Analysis

**React** has the largest ecosystem and hiring pool. For a complex dashboard with video grids, live events, drag-drop layout builders, and charting — React's ecosystem is unmatched.

**Vue 3** is a strong alternative, especially popular in Vietnam. Easier learning curve, excellent TypeScript support. Slightly smaller ecosystem for enterprise dashboard components.

Both are valid. Decision comes down to team preference and existing skills.

### ✅ Recommendation
- **React** with TypeScript — larger ecosystem for complex dashboards, more component libraries, easier to hire senior developers for enterprise-grade UI

---

## 4. Mobile Framework

### Requirements
- BLE for mobile credentials (phone-as-key)
- Push notifications (critical security alerts)
- Camera/video streaming (WebRTC live view)
- Offline capability (basic access control decisions)
- Two apps: Admin/Security + Resident

| Criteria | **Flutter** | **React Native** | **Native (Kotlin + Swift)** |
|----------|-------------|-------------------|---------------------------|
| **Performance** | ⭐⭐⭐⭐ Near-native (Dart compiled to ARM) | ⭐⭐⭐ Good, bridge overhead for native modules | ⭐⭐⭐⭐⭐ Best possible |
| **BLE Support** | ⭐⭐⭐⭐ flutter_blue_plus — mature | ⭐⭐⭐ react-native-ble-plx — works but quirky | ⭐⭐⭐⭐⭐ Full native API access |
| **Video/WebRTC** | ⭐⭐⭐⭐ flutter-webrtc — good | ⭐⭐⭐ react-native-webrtc — works | ⭐⭐⭐⭐⭐ Full control |
| **Push Notifications** | ⭐⭐⭐⭐⭐ Firebase + local notifications | ⭐⭐⭐⭐⭐ Same | ⭐⭐⭐⭐⭐ Native |
| **Offline** | ⭐⭐⭐⭐ Hive/Isar local DB | ⭐⭐⭐ AsyncStorage, SQLite | ⭐⭐⭐⭐⭐ Core Data / Room |
| **UI Quality** | ⭐⭐⭐⭐⭐ Pixel-perfect, Material 3 + Cupertino | ⭐⭐⭐⭐ Uses native components | ⭐⭐⭐⭐⭐ Best native feel |
| **Development Speed** | ⭐⭐⭐⭐⭐ Single codebase, hot reload | ⭐⭐⭐⭐ Single codebase, hot reload | ⭐⭐ Two codebases, 2x effort |
| **Hiring (Vietnam)** | ⭐⭐⭐⭐ Very popular, growing fast | ⭐⭐⭐⭐ Popular | ⭐⭐⭐ Need iOS + Android devs |
| **Code Sharing** | ⭐⭐⭐⭐⭐ ~95% shared | ⭐⭐⭐⭐ ~90% shared | ⭐ Zero shared |
| **License** | BSD (Flutter), BSD (Dart) | MIT | N/A |

### Analysis

**Flutter** is the clear winner for this use case:
- Strong BLE support (critical for mobile credentials)
- Excellent video/WebRTC integration
- Single codebase for two apps (Admin + Resident) with shared business logic
- Very popular in Vietnam — easy to hire
- Material 3 design system built-in
- Dart's sound null safety reduces runtime crashes (important for security app)

**Native** would give best BLE/hardware access but doubles development cost and team size.

### ✅ Recommendation
- **Flutter** — single codebase for both apps, strong BLE and WebRTC support, popular in Vietnam

---

## 5. Database

### Requirements
- Relational data: users, access rules, tenants, config (ACID transactions)
- Time-series data: access events, sensor readings, energy data (billions of rows)
- Analytics: aggregations, trend analysis, dashboards
- Multi-tenancy: schema or row-level isolation
- On-premise: must run without cloud services

| Criteria | **PostgreSQL** | **TimescaleDB** | **MongoDB** | **ClickHouse** |
|----------|---------------|-----------------|-------------|----------------|
| **Data Model** | Relational | Relational + time-series (PG extension) | Document | Columnar (analytics) |
| **Best For** | Core business data, access rules, users | Time-series events + relational | Flexible schemas, event logs | Analytics, aggregations, dashboards |
| **Performance (OLTP)** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Same as PG for relational | ⭐⭐⭐⭐ Good for reads | ⭐ Not designed for OLTP |
| **Performance (Time-series)** | ⭐⭐⭐ Decent with partitioning | ⭐⭐⭐⭐⭐ Hypertables, continuous aggregates, compression | ⭐⭐⭐ TTL collections | ⭐⭐⭐⭐⭐ Blazing fast aggregations |
| **Performance (Analytics)** | ⭐⭐⭐ Good for moderate scale | ⭐⭐⭐⭐ Continuous aggregates | ⭐⭐ Aggregation pipeline is slow | ⭐⭐⭐⭐⭐ Purpose-built for this |
| **Multi-tenancy** | ⭐⭐⭐⭐⭐ Schema-per-tenant or RLS | ⭐⭐⭐⭐⭐ Same (PG extension) | ⭐⭐⭐⭐ Separate databases easy | ⭐⭐⭐ Possible but not ideal |
| **HA / Replication** | ⭐⭐⭐⭐ Streaming replication, Patroni | ⭐⭐⭐⭐ Same + multi-node (paid) | ⭐⭐⭐⭐⭐ Built-in replica sets | ⭐⭐⭐⭐ ReplicatedMergeTree |
| **On-premise** | ⭐⭐⭐⭐⭐ Lightweight, easy | ⭐⭐⭐⭐⭐ Same (PG extension) | ⭐⭐⭐⭐ Easy but heavier | ⭐⭐⭐⭐ Easy Docker deploy |
| **Ecosystem** | ⭐⭐⭐⭐⭐ Massive | ⭐⭐⭐⭐⭐ Full PG ecosystem + extras | ⭐⭐⭐⭐ Large | ⭐⭐⭐ Growing |
| **License** | PostgreSQL License (permissive) | Apache 2.0 (community) / Paid (cloud/enterprise) | SSPL (not OSI-approved) | Apache 2.0 |
| **Cost** | Free | Free (community) / Paid for multi-node | Free (community, SSPL) | Free |

### Analysis

This is a **polyglot persistence** scenario — no single database fits all needs:

1. **TimescaleDB** (PostgreSQL + time-series extension) handles both relational AND time-series in one database. This is ideal for on-premise deployment (fewer moving parts). Core business data (users, access rules, tenants) in regular PG tables. Access events, sensor data, energy readings in hypertables with automatic compression and continuous aggregates.

2. **ClickHouse** for heavy analytics if scale demands it (billions of events, complex aggregations for dashboards). Can be added later when needed — not required for Phase 1.

3. **MongoDB** — avoid. SSPL license is problematic for commercial products. No strong reason to use document DB when TimescaleDB covers both relational and time-series.

### ✅ Recommendation
- **Primary:** TimescaleDB (PostgreSQL + Timescale extension) — one DB for relational + time-series
- **Analytics (Phase 3):** ClickHouse — add when analytics scale demands it
- **Search:** Consider Meilisearch or PostgreSQL full-text search for audit log search

---

## 6. Cache / Real-time

### Requirements
- Session management, access rule caching
- Real-time event pub/sub (WebSocket backend)
- Rate limiting
- Leaderboard/counting (occupancy tracking)

| Criteria | **Redis 7** | **Valkey 8** | **KeyDB** |
|----------|-------------|-------------|-----------|
| **Performance** | ⭐⭐⭐⭐⭐ Industry standard | ⭐⭐⭐⭐⭐ Same (Redis fork) | ⭐⭐⭐⭐⭐ Multi-threaded, faster on multi-core |
| **Features** | ⭐⭐⭐⭐⭐ Streams, pub/sub, modules, RediSearch | ⭐⭐⭐⭐⭐ Same features, active development | ⭐⭐⭐⭐ Core features, fewer modules |
| **Pub/Sub** | ⭐⭐⭐⭐⭐ Redis Streams + Pub/Sub | ⭐⭐⭐⭐⭐ Same | ⭐⭐⭐⭐ Basic pub/sub |
| **HA** | ⭐⭐⭐⭐ Sentinel / Cluster | ⭐⭐⭐⭐ Same | ⭐⭐⭐⭐ Active replication, multi-master |
| **License** | ⚠️ **SSPL** (Redis 7.4+) — not OSI open source | ✅ **BSD 3-Clause** (Linux Foundation) | ✅ **BSD 3-Clause** |
| **Community** | ⭐⭐⭐⭐⭐ Largest, but fragmenting | ⭐⭐⭐⭐ Growing fast (AWS, Google, Oracle backing) | ⭐⭐⭐ Smaller |
| **Cost** | Free (SSPL) / Paid (Redis Enterprise) | Free | Free |

### Analysis

**Valkey** is the clear choice in 2026:
- Redis changed to SSPL license — problematic for commercial products
- Valkey is the Linux Foundation fork backed by AWS, Google, Oracle, Alibaba
- 100% API compatible with Redis — all clients work
- Active development, growing faster than Redis community
- BSD license — safe for commercial use

### ✅ Recommendation
- **Valkey** — drop-in Redis replacement, permissive license, backed by major cloud vendors

---

## 7. Message Broker

### Requirements
- MQTT for IoT sensors (native protocol support)
- Event-driven architecture (access events, alerts, automation triggers)
- Message durability (audit trail — no lost events)
- On-premise deployment
- Scale to thousands of connected devices per building

| Criteria | **EMQX** | **RabbitMQ** | **NATS** | **Apache Kafka** |
|----------|----------|-------------|----------|-----------------|
| **MQTT Native** | ⭐⭐⭐⭐⭐ Purpose-built MQTT broker | ⭐⭐⭐ Plugin (basic MQTT 3.1.1) | ⭐⭐ Via adapter only | ⭐ Not MQTT |
| **Message Patterns** | Pub/Sub, Request/Reply, Shared Sub | Pub/Sub, Routing, RPC, Priority queues | Pub/Sub, Request/Reply, Queue Groups | Pub/Sub, Streams (log-based) |
| **Performance** | ⭐⭐⭐⭐⭐ 100M+ connections, low latency | ⭐⭐⭐ Good but lower throughput | ⭐⭐⭐⭐⭐ Extremely fast, low latency | ⭐⭐⭐⭐⭐ Highest throughput (batch) |
| **IoT Suitability** | ⭐⭐⭐⭐⭐ Built for IoT: rules engine, bridging | ⭐⭐⭐ General purpose | ⭐⭐⭐⭐ Lightweight, good for edge | ⭐⭐ Over-engineered for IoT |
| **Durability** | ⭐⭐⭐⭐ Session persistence, retained messages | ⭐⭐⭐⭐⭐ Quorum queues, very durable | ⭐⭐⭐⭐ JetStream for persistence | ⭐⭐⭐⭐⭐ Log-based, excellent |
| **Rules/Routing** | ⭐⭐⭐⭐⭐ Built-in rule engine (SQL-like) | ⭐⭐⭐⭐ Exchange routing | ⭐⭐⭐ Subject-based routing | ⭐⭐⭐ Kafka Streams |
| **On-premise** | ⭐⭐⭐⭐⭐ Docker, K8s, single-node | ⭐⭐⭐⭐⭐ Very easy | ⭐⭐⭐⭐⭐ Single binary, tiny | ⭐⭐⭐ Heavy (ZooKeeper/KRaft) |
| **Resource Usage** | ⭐⭐⭐⭐ Moderate (Erlang VM) | ⭐⭐⭐ Moderate (Erlang VM) | ⭐⭐⭐⭐⭐ Very lightweight | ⭐⭐ Heavy (JVM, storage) |
| **Learning Curve** | ⭐⭐⭐⭐ Good docs, MQTT-focused | ⭐⭐⭐⭐ Well-documented | ⭐⭐⭐⭐ Simple concepts | ⭐⭐ Complex (partitions, consumers, offsets) |
| **License** | Apache 2.0 (open source edition) | MPL 2.0 | Apache 2.0 | Apache 2.0 |
| **Cost** | Free (open source) / Paid (enterprise) | Free | Free | Free |

### Analysis

This platform needs **two messaging capabilities**:

1. **MQTT Broker** for IoT device communication → **EMQX** is purpose-built
   - Native MQTT 5.0 with QoS levels
   - Built-in rule engine can route MQTT messages to databases, HTTP, Kafka
   - CoAP/LwM2M support for constrained IoT devices
   - Dashboard for device management

2. **Internal Event Bus** for microservice communication → **NATS** with JetStream
   - Extremely lightweight (single binary, ~20MB memory)
   - JetStream for durable messaging (audit events must not be lost)
   - Perfect for on-premise (tiny footprint)
   - Subject-based routing is intuitive for event-driven architecture

**Kafka** is overkill unless processing millions of events/second. Can add later if analytics pipeline demands it.

### ✅ Recommendation
- **EMQX** — MQTT broker for all IoT/sensor devices
- **NATS + JetStream** — internal event bus for microservice communication
- **Kafka** (optional Phase 3) — add for heavy analytics streaming if needed

---

## 8. Video / Streaming

### Requirements
- RTSP ingest from IP cameras (Hikvision, Dahua, ONVIF)
- WebRTC output for low-latency live view in browser/mobile
- HLS/DASH for playback
- Multi-camera grid (16+ cameras simultaneously)
- Event-triggered recording clips
- Integration with AI analytics pipeline

| Criteria | **MediaMTX** | **go2rtc** | **Frigate** | **ZoneMinder** |
|----------|-------------|-----------|-------------|----------------|
| **Purpose** | RTSP/WebRTC proxy server | Lightweight stream proxy | NVR with AI object detection | Full NVR/VMS |
| **RTSP → WebRTC** | ⭐⭐⭐⭐⭐ Native, low latency | ⭐⭐⭐⭐⭐ Native, very efficient | ⭐⭐⭐⭐ Via go2rtc (embedded) | ⭐⭐ Limited WebRTC |
| **ONVIF** | ⭐⭐⭐ Basic discovery | ⭐⭐⭐ Basic | ⭐⭐⭐⭐ Auto-detection | ⭐⭐⭐⭐ ONVIF support |
| **Performance** | ⭐⭐⭐⭐⭐ Go-based, very efficient | ⭐⭐⭐⭐⭐ Go-based, minimal overhead | ⭐⭐⭐⭐ Good, needs GPU for AI | ⭐⭐ Older architecture, heavier |
| **AI Integration** | ⭐⭐ None built-in (proxy only) | ⭐⭐ None built-in (proxy only) | ⭐⭐⭐⭐⭐ Built-in object detection (YOLO, OpenVINO) | ⭐⭐⭐ Basic motion detection |
| **Recording** | ⭐⭐ Basic segment recording | ⭐ No recording | ⭐⭐⭐⭐⭐ Event-based, continuous | ⭐⭐⭐⭐⭐ Full recording/playback |
| **Scalability** | ⭐⭐⭐⭐⭐ Handles thousands of streams | ⭐⭐⭐⭐⭐ Very lightweight per stream | ⭐⭐⭐ Limited by AI processing | ⭐⭐ Not designed for scale |
| **Embeddability** | ⭐⭐⭐⭐⭐ Library or standalone | ⭐⭐⭐⭐⭐ Library or standalone | ⭐⭐ Standalone only | ⭐ Standalone only |
| **License** | MIT | MIT | MIT | GPL v2 ⚠️ |
| **Resource Usage** | ⭐⭐⭐⭐⭐ Very low | ⭐⭐⭐⭐⭐ Minimal | ⭐⭐⭐ Moderate (AI processing) | ⭐⭐ Heavy |

### Analysis

For Duall Master 3.0, we don't need a standalone NVR — cameras already record to their NVRs. We need:

1. **Stream proxy** — take RTSP from cameras, serve WebRTC to browsers/mobile
2. **AI pipeline feeder** — tap streams for video analytics
3. **Event clip extraction** — grab video clips around access events

**go2rtc** is the best stream proxy — used internally by Frigate, extremely efficient, supports RTSP→WebRTC transcoding with zero decode (passthrough).

**Frigate** is excellent if we want built-in AI object detection, but its NVR features overlap with existing camera NVRs. Better to build a custom AI analytics pipeline.

**Custom approach:** go2rtc for stream proxying + custom Go service for event clip extraction + Python AI pipeline for video analytics.

### ✅ Recommendation
- **go2rtc** — stream proxy (RTSP → WebRTC/HLS), embedded as library in Go services
- **Custom Go service** — event-linked clip extraction, camera health monitoring
- **Python AI service** — video analytics using OpenCV + YOLO/OpenVINO (see AI/ML section)
- Avoid ZoneMinder (GPL, outdated) and full Frigate (overlaps with camera NVRs)

---

## 9. AI/ML Stack

### Requirements
- On-premise LLM for AI Assistant (Vietnamese + English, no cloud dependency)
- Video analytics (object detection, face recognition, LPR)
- Anomaly detection on access patterns
- Predictive maintenance models
- Must run on customer hardware (GPU optional, CPU fallback)

### 9.1 On-Premise LLM Inference

| Criteria | **Ollama** | **vLLM** | **llama.cpp (server)** | **TGI (HuggingFace)** |
|----------|-----------|---------|----------------------|---------------------|
| **Ease of Setup** | ⭐⭐⭐⭐⭐ One-line install | ⭐⭐⭐ Requires Python env | ⭐⭐⭐⭐ Single binary | ⭐⭐⭐ Docker-based |
| **Performance (GPU)** | ⭐⭐⭐⭐ Good (uses llama.cpp) | ⭐⭐⭐⭐⭐ Best GPU throughput (PagedAttention) | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Optimized for production |
| **Performance (CPU)** | ⭐⭐⭐⭐ Good CPU inference | ⭐⭐ GPU-focused | ⭐⭐⭐⭐⭐ Best CPU inference (GGUF quantization) | ⭐⭐⭐ Decent |
| **Model Support** | ⭐⭐⭐⭐⭐ Huge model library, easy pull | ⭐⭐⭐⭐ HuggingFace models | ⭐⭐⭐⭐ GGUF format models | ⭐⭐⭐⭐ HuggingFace models |
| **API Compatibility** | ⭐⭐⭐⭐⭐ OpenAI-compatible API | ⭐⭐⭐⭐⭐ OpenAI-compatible API | ⭐⭐⭐⭐ OpenAI-compatible | ⭐⭐⭐⭐ OpenAI-compatible |
| **Concurrent Users** | ⭐⭐⭐ Limited (sequential by default) | ⭐⭐⭐⭐⭐ Best (continuous batching) | ⭐⭐⭐ Basic concurrency | ⭐⭐⭐⭐ Good batching |
| **Resource Management** | ⭐⭐⭐⭐ Auto model loading/unloading | ⭐⭐⭐ Manual | ⭐⭐⭐ Manual | ⭐⭐⭐ Docker-managed |
| **On-premise Suitability** | ⭐⭐⭐⭐⭐ Designed for local deployment | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Minimal dependencies | ⭐⭐⭐⭐ Good |
| **License** | MIT | Apache 2.0 | MIT | Apache 2.0 |

**Recommended LLM Models for Duall Master:**
- **Qwen2.5 7B/14B** — excellent multilingual (Vietnamese + English), Apache 2.0
- **Llama 3.1 8B** — strong reasoning, good for function calling
- **Phi-3 mini** — Microsoft, very efficient on CPU for smaller deployments
- Fine-tune on building security domain data for better accuracy

### 9.2 Video Analytics / Computer Vision

| Criteria | **OpenVINO** | **TensorRT** | **ONNX Runtime** | **PyTorch (direct)** |
|----------|-------------|-------------|-------------------|---------------------|
| **Intel CPU Optimization** | ⭐⭐⭐⭐⭐ Purpose-built | ⭐ NVIDIA only | ⭐⭐⭐⭐ Good CPU support | ⭐⭐⭐ Decent |
| **NVIDIA GPU** | ⭐⭐⭐ Via plugins | ⭐⭐⭐⭐⭐ Best NVIDIA performance | ⭐⭐⭐⭐ Good GPU support | ⭐⭐⭐⭐ Good |
| **Edge Deployment** | ⭐⭐⭐⭐⭐ Designed for edge | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Cross-platform | ⭐⭐ Heavy |
| **Model Zoo** | ⭐⭐⭐⭐ Good pre-trained models | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Converts from any framework | ⭐⭐⭐⭐⭐ Largest |
| **On-premise (no GPU)** | ⭐⭐⭐⭐⭐ Best for CPU-only | ⭐ Requires NVIDIA GPU | ⭐⭐⭐⭐ Good CPU fallback | ⭐⭐⭐ Slow on CPU |
| **License** | Apache 2.0 | Proprietary (free) | MIT | BSD |

### Analysis

**For LLM inference:** Use **Ollama** for simplicity in Phase 1, migrate to **vLLM** for production scale in Phase 2+ when concurrent user load increases. Both expose OpenAI-compatible APIs, so application code doesn't change.

**For video analytics:** Use **ONNX Runtime** as the inference backend — it's the most portable. Train/develop models in PyTorch, export to ONNX, run with ONNX Runtime. This allows:
- Intel CPU → ONNX Runtime with OpenVINO execution provider
- NVIDIA GPU → ONNX Runtime with TensorRT execution provider
- No GPU → ONNX Runtime CPU (still fast enough for 10-20 FPS analytics)

### ✅ Recommendation
- **LLM:** Ollama (Phase 1) → vLLM (Phase 2+), Qwen2.5 models for Vietnamese support
- **Video AI:** PyTorch (training) + ONNX Runtime (inference) with OpenVINO/TensorRT backends
- **Anomaly Detection:** scikit-learn / PyOD for access pattern anomalies
- **Face Recognition:** InsightFace (open source, Apache 2.0)
- **LPR:** PaddleOCR or custom YOLO-based plate detection

---

## 10. DevOps

### Requirements
- On-premise deployment (single server to multi-server cluster)
- Cloud SaaS deployment (multi-tenant)
- Automated updates
- Monitoring and alerting
- Must be manageable by customer IT teams (on-premise)

| Criteria | **Docker Compose** | **Kubernetes (K3s)** | **Ansible** | **Nomad** |
|----------|-------------------|---------------------|-------------|-----------|
| **On-premise (small)** | ⭐⭐⭐⭐⭐ Perfect for single server | ⭐⭐⭐ Overkill for small | ⭐⭐⭐⭐ Good for provisioning | ⭐⭐⭐⭐ Lighter than K8s |
| **On-premise (large)** | ⭐⭐ Limited to single host | ⭐⭐⭐⭐⭐ Multi-node, HA | ⭐⭐⭐⭐ Multi-server provisioning | ⭐⭐⭐⭐ Multi-node, simpler |
| **Cloud SaaS** | ⭐⭐ Not suitable | ⭐⭐⭐⭐⭐ Industry standard | ⭐⭐⭐ For initial provisioning | ⭐⭐⭐⭐ Good alternative |
| **Learning Curve** | ⭐⭐⭐⭐⭐ Very simple | ⭐⭐ Steep | ⭐⭐⭐⭐ YAML playbooks | ⭐⭐⭐ Moderate |
| **Auto-scaling** | ⭐ No | ⭐⭐⭐⭐⭐ HPA, VPA | ⭐ No | ⭐⭐⭐⭐ Auto-scaling support |
| **Rolling Updates** | ⭐⭐ Basic | ⭐⭐⭐⭐⭐ Zero-downtime | ⭐⭐⭐ With playbooks | ⭐⭐⭐⭐ Rolling updates |
| **Monitoring** | ⭐⭐⭐ Needs external tools | ⭐⭐⭐⭐⭐ Prometheus/Grafana native | ⭐⭐ Needs external | ⭐⭐⭐⭐ Built-in metrics |

### Deployment Strategy

**Two deployment targets require two strategies:**

1. **On-premise (single server):** Docker Compose — simple, customer IT can manage
2. **On-premise (HA/large):** K3s (lightweight Kubernetes) — multi-node, auto-healing
3. **Cloud SaaS:** Full Kubernetes (EKS/AKS/GKE) — auto-scaling, multi-tenant

**Monitoring Stack:**
- Prometheus + Grafana (metrics)
- Loki (logs)
- OpenTelemetry (distributed tracing)

**CI/CD:**
- GitHub Actions or GitLab CI
- ArgoCD for Kubernetes GitOps

### ✅ Recommendation
- **On-premise small:** Docker Compose with custom installer script
- **On-premise HA:** K3s (lightweight Kubernetes by Rancher)
- **Cloud SaaS:** Managed Kubernetes (EKS/GKE)
- **Provisioning:** Ansible for initial server setup
- **Monitoring:** Prometheus + Grafana + Loki (all open source)
- **CI/CD:** GitHub Actions + ArgoCD

---

## 11. API Gateway

### Requirements
- Rate limiting, authentication (JWT/OAuth2)
- Multi-tenant routing
- WebSocket support (real-time events)
- gRPC proxying (internal services)
- On-premise deployable

| Criteria | **Traefik** | **Kong** | **APISIX** | **Custom (Go)** |
|----------|------------|---------|-----------|----------------|
| **Performance** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Good (Nginx-based) | ⭐⭐⭐⭐⭐ Excellent (Nginx + Lua) | ⭐⭐⭐⭐⭐ Optimal for use case |
| **Docker/K8s Integration** | ⭐⭐⭐⭐⭐ Auto-discovery, IngressRoute | ⭐⭐⭐⭐ Ingress controller | ⭐⭐⭐⭐ Ingress controller | ⭐⭐ Manual configuration |
| **WebSocket** | ⭐⭐⭐⭐⭐ Native | ⭐⭐⭐⭐ Supported | ⭐⭐⭐⭐ Supported | ⭐⭐⭐⭐⭐ Full control |
| **gRPC** | ⭐⭐⭐⭐ Supported | ⭐⭐⭐⭐ Supported | ⭐⭐⭐⭐ Supported | ⭐⭐⭐⭐⭐ Native |
| **Auth Plugins** | ⭐⭐⭐⭐ ForwardAuth, JWT | ⭐⭐⭐⭐⭐ Rich plugin ecosystem | ⭐⭐⭐⭐⭐ Rich plugins | ⭐⭐⭐ Build your own |
| **Rate Limiting** | ⭐⭐⭐⭐ Built-in | ⭐⭐⭐⭐⭐ Advanced (per-tenant, per-API) | ⭐⭐⭐⭐⭐ Advanced | ⭐⭐⭐ Build your own |
| **Learning Curve** | ⭐⭐⭐⭐⭐ Very simple YAML | ⭐⭐⭐ More complex | ⭐⭐⭐ Moderate | ⭐⭐ Need to build everything |
| **On-premise** | ⭐⭐⭐⭐⭐ Single binary | ⭐⭐⭐⭐ Docker, needs Postgres | ⭐⭐⭐⭐ Docker, needs etcd | ⭐⭐⭐⭐⭐ Embedded |
| **License** | MIT | Apache 2.0 | Apache 2.0 | N/A |
| **Cost** | Free (enterprise paid) | Free (enterprise paid) | Free | Development cost |

### Analysis

**Traefik** wins for this use case:
- Simplest Docker/K8s integration (auto-discovers services)
- Works great for both Docker Compose (on-premise) and Kubernetes (cloud)
- Built-in Let's Encrypt, WebSocket, gRPC support
- MIT license
- Lightweight enough for on-premise single-server deployment

Kong is more feature-rich but adds complexity (needs its own Postgres database).

### ✅ Recommendation
- **Traefik** — simple, powerful, works across all deployment modes
- Use Traefik middlewares for JWT validation, rate limiting, CORS
- ForwardAuth to custom auth service for complex multi-tenant auth

---

## 12. Recommended Stack Summary

### The Duall Master 3.0 Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  Web Console: React + TypeScript                                │
│  Mobile Apps: Flutter (Admin + Resident)                        │
│  Android Terminal: Flutter (Kiosk mode)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY: Traefik                       │
│  JWT auth · Rate limiting · WebSocket · gRPC · Let's Encrypt    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVICES (Go)                         │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Access   │ │ Identity │ │ Facility │ │ Device   │          │
│  │ Control  │ │ & People │ │ Ops      │ │ Gateway  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Video    │ │ Alert &  │ │ Tenant   │ │ Auth &   │          │
│  │ Service  │ │ Automate │ │ Manager  │ │ SSO      │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                 │
│                    AI SERVICES (Python)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ AI Asst  │ │ Video    │ │ Anomaly  │                       │
│  │ (Ollama) │ │ Analytics│ │ Detect   │                       │
│  └──────────┘ └──────────┘ └──────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      MESSAGING LAYER                            │
│  EMQX (IoT/MQTT) · NATS+JetStream (Internal Events)            │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
│  TimescaleDB (relational + time-series)                         │
│  Valkey (cache + real-time pub/sub)                             │
│  MinIO (object storage: video clips, photos, documents)         │
│  ClickHouse (analytics — Phase 3)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      VIDEO LAYER                                │
│  go2rtc (RTSP→WebRTC proxy) · ONVIF device manager             │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      DEVICE LAYER                               │
│  Readers · Controllers · Cameras · Sensors · Barriers · Lifts   │
│  Protocols: OSDP · Wiegand · ONVIF · MQTT · BACnet · Modbus    │
└─────────────────────────────────────────────────────────────────┘
```

### Summary Table

| Component | Choice | License | Rationale |
|-----------|--------|---------|-----------|
| **Backend** | Go | BSD | Best concurrency, small binaries, on-premise friendly |
| **AI Services** | Python/FastAPI | MIT | Best ML ecosystem |
| **Frontend** | React + TypeScript | MIT | Largest ecosystem for dashboards |
| **Mobile** | Flutter | BSD | Single codebase, strong BLE/WebRTC, popular in VN |
| **Database** | TimescaleDB | Apache 2.0 | PostgreSQL + time-series in one |
| **Analytics DB** | ClickHouse (Phase 3) | Apache 2.0 | Blazing fast aggregations |
| **Cache** | Valkey | BSD | Redis-compatible, permissive license |
| **MQTT Broker** | EMQX | Apache 2.0 | Purpose-built MQTT, rules engine |
| **Event Bus** | NATS + JetStream | Apache 2.0 | Lightweight, durable messaging |
| **Video Proxy** | go2rtc | MIT | Best RTSP→WebRTC, embeddable |
| **LLM Inference** | Ollama → vLLM | MIT / Apache 2.0 | On-premise, OpenAI-compatible API |
| **Vision AI** | ONNX Runtime | MIT | Portable across Intel/NVIDIA/CPU |
| **API Gateway** | Traefik | MIT | Simple, Docker/K8s native |
| **Deployment (small)** | Docker Compose | Apache 2.0 | Simple on-premise |
| **Deployment (HA)** | K3s | Apache 2.0 | Lightweight Kubernetes |
| **Monitoring** | Prometheus + Grafana + Loki | Apache 2.0 | Industry standard, all OSS |
| **Object Storage** | MinIO | AGPL / Commercial | S3-compatible, on-premise |
| **Auth** | Keycloak or custom | Apache 2.0 | SSO, SAML, OIDC, LDAP |

### Key Design Principles

1. **All open-source, permissive licenses** — no vendor lock-in, safe for commercial use
2. **On-premise first** — every component runs without internet, cloud is additive
3. **Polyglot but focused** — Go for platform, Python for AI, minimal language sprawl
4. **Start simple, scale up** — Docker Compose → K3s → Full K8s as customer grows
5. **API-first** — all services expose gRPC (internal) and REST (external) APIs
6. **Event-driven** — NATS as the nervous system, everything reacts to events

### Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Go hiring pool smaller than Java | Invest in training; Go is simple to learn (~2 weeks for Java devs) |
| EMQX enterprise features needed | Open source edition covers our needs; can upgrade later |
| TimescaleDB single-node limits | ClickHouse for analytics offload; TimescaleDB multi-node if needed |
| Flutter platform limitations | Critical BLE/NFC modules can use platform channels to native code |
| On-premise LLM performance | Start with small models (7B); customer can add GPU for larger models |

---

*This research feeds into the Duall Master 3.0 Architecture Design document.*
