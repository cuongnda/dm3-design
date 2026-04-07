# Offline-First Architecture Update — Changes Summary

**Date:** 2026-02-19  
**Scope:** All Duall Master 3.0 documentation  
**Direction:** CEO directive — system must be OFFLINE-FIRST

---

## Core Change

**OLD:** Device scans → sends credential to server → server decides → sends grant/deny back  
**NEW:** Device scans → matches locally against synced user DB → decides locally → sends event log to server

---

## Files Updated

### 1. `duall-master-mqtt-protocol.md` — MAJOR changes
- **Removed** `access.scan` (device asking server) and `access.decision` (server responding) messages
- **Added** `access.log` event type — device reports what already happened locally
- **Added** `cfg.blacklist` message — real-time blacklist pushes (QoS 2, immediate)
- **Added** `cfg.access_rules` message — zone/schedule/group rule sync to devices
- **Updated** Normal Access Flow diagram — shows LOCAL decision (<50ms), event log sent async
- **Updated** Offline Access Flow — reframed as "same as normal, offline IS default"
- **Rewrote** Section 8 "Offline Mode & Sync" → "Offline-First Architecture & Sync" with:
  - Local Decision Engine description
  - Sync Protocol details (Full/Incremental/Priority/Event upload)
  - Sync confirmation with DB versioning
  - Conflict resolution (server wins)
  - Reconnection flow
  - Local SQLite storage schema
- **Updated** QoS matrix — removed `access.decision`, changed `access.scan` → `access.log`, added `cfg.blacklist` and `cfg.access_rules`
- **Updated** `cfg.full` config — mode changed from "online|offline|hybrid" to "offline_first"

### 2. `duall-master-system-architecture.md` — Significant changes
- **Updated** access-svc component diagram — role changed from "Access Decision Engine" to "Rule & Sync Management Engine" with Rule CRUD, User DB Sync Orchestrator, Blacklist Manager, Sync Publisher, Event Log Ingester, Analytics
- **Updated** service communication patterns — "Access decision (<50ms): gRPC" → "Rule queries (<50ms): gRPC"
- **Updated** NATS subject hierarchy — `access.decision` → `access.sync`, `access.event` → `access.log`
- **Updated** service boundary map — access-svc description: "Door/gate control, credentials" → "Rule mgmt + sync orch + analytics"
- **Updated** device-gateway description — "Protocol adapters" → "Sync coord., Protocol adapters"
- **Updated** device communication flow — documented separate Command Flow, Sync Flow, Event Flow
- **Updated** access_events SQL comment — clarified events are received from devices, decisions made locally

### 3. `duall-master-terminal-ux.md` — Targeted updates
- **Updated** recognition behavior section — all matching happens on-device against local user DB in <50ms
- **Updated** host notification — triggered by device access.log event, not server decision
- **Updated** network offline section — access decisions work offline as normal mode, not fallback

### 4. `duall-master-guard-station-ux.md` — No changes needed
- Guard station displays event feeds which are already compatible with offline-first (events come from devices)
- Remote commands (door unlock, lockdown) still go through server→device which is correct

### 5. `duall-master-webapp-ux.md` — Targeted updates
- **Updated** dashboard "Live Access Events" → "Access Event Logs (from synced device logs)"
- **Updated** door detail status card — added sync status (last sync time, user DB version, rules version)
- **Updated** access rules creation — noted rules are synced to devices on activation with progress tracking

### 6. `duall-master-mobile-ux.md` — Targeted updates
- **Updated** remote door control — clarified remote unlock is server→device command, normal access is local
- **Updated** door detail screen — shows sync status instead of just event history
- **Updated** visitor invitations — visitor pass data synced to terminal devices for offline check-in

### 7. `duall-master-tech-stack-recommendation.md` — Targeted updates
- **Updated** executive summary — added "Offline-first, edge-computing architecture" and core principle section
- **Added** SQLite as device-side database — for local user DB, access rules, blacklists, event queue
- **Added** sync protocol considerations — delta updates, full sync, priority sync, cursor tokens

### 8. `duall-master-website-copy.md` — Marketing updates
- **Added** "Works Without Internet. Zero-Latency Access." value proposition section
- **Updated** access control section — emphasized zero-latency local decisions
- **Added** competitive advantage rows — offline-first vs cloud-dependent, <50ms vs 200ms+ latency
- **Updated** government/military section — emphasized offline-first for air-gapped environments

### 9. `Duall-Master-3.0-Vision-v2.md` — Strategic updates
- **Added** "Offline-first architecture" as a core platform principle
- **Updated** access control features — added "Offline-First Local Decisions" feature
- **Updated** feature descriptions — "Real-time Monitoring" → "Real-time Event Monitoring" (event logs from devices)
- **Added** local access decision time metric (target: <50ms)
- **Updated** competitive differentiation — highlighted offline-first vs cloud-dependent competitors
- **Added** "Offline-First, Zero-Latency" as unique value proposition #2

---

## What STAYS Server-Side (unchanged)
- Rule/user DB management (CRUD via web/mobile)
- Sync orchestration (push rules to devices via MQTT)
- Event log aggregation + analytics + dashboards
- Remote commands (emergency lockdown, remote unlock)
- Video pipeline (cameras stream to server)
- Visitor pre-registration (server creates pass → syncs to terminal)
