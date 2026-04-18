# Duall Master 3.0 — Tech Stack Recommendation

**Date:** February 2026 | **For:** CEO Decision | **Status:** FINAL RECOMMENDATION

---

## Executive Summary

All-open-source stack. No vendor lock-in. **Offline-first, edge-computing architecture.** On-premise first, cloud-additive. Two languages only: **Go** (platform) + **Python** (AI). Estimated 12–15 user team. Phase 1 launch in 8–10 months.

### Core Architecture Principle: Offline-First

Devices make all access decisions locally. The server manages rules, syncs user databases to devices, and aggregates event logs for analytics. Zero dependency on connectivity for access control operations.

---

## 1. Component Decisions

### Backend: **Go**

Go's goroutine model handles thousands of concurrent device connections with minimal memory (~20–50MB/service). Single-binary deployment is ideal for on-premise customers. Used by Verkada, Docker, Kubernetes — proven for infrastructure software.

- **Risks:** Smaller hiring pool than Java → mitigate with training (Java devs learn Go in 2–3 weeks); Go's error handling verbosity → use established patterns
- **License/Cost:** BSD, completely free
- **Hiring (VN):** Growing pool, mid-level ~$1,200–2,000/mo. Can retrain Java/Node devs quickly
- **Migration path:** gRPC service boundaries allow replacing individual services with any language

### AI Services: **Python + FastAPI**

Unmatched ML ecosystem. FastAPI provides async performance adequate for AI service endpoints. Keeps AI team productive with familiar tooling.

- **Risks:** Performance for non-AI workloads → only use for AI, not core platform
- **License/Cost:** MIT, free
- **Hiring (VN):** Large pool, easy to find ML engineers ~$1,500–2,500/mo
- **Migration path:** OpenAI-compatible API means any inference backend swaps transparently

### Frontend: **React + TypeScript**

Largest ecosystem for complex dashboards — AG Grid, react-grid-layout, recharts, hls.js all mature. Most senior frontend devs in Vietnam know React.

- **Risks:** Bundle size for complex dashboards → code splitting, lazy loading
- **License/Cost:** MIT, free
- **Hiring (VN):** Easiest to hire, senior React ~$1,500–2,500/mo
- **Migration path:** Component-based; could migrate to Vue/Svelte incrementally

### Mobile: **Flutter**

Single codebase for 4 apps (Admin iOS/Android, Resident iOS/Android). Strong BLE support for mobile credentials. Material 3 built-in.

- **Risks:** BLE edge cases → use platform channels for critical native BLE code
- **License/Cost:** BSD, free
- **Hiring (VN):** Very popular, mid-level ~$1,200–1,800/mo
- **Migration path:** Could go native for specific apps if Flutter hits hard limits

### Device-Side Database: **SQLite**

Every access terminal runs SQLite locally for the offline-first architecture. Stores synced user DB (face templates, card UIDs, fingerprint templates), access rules, blacklists, and pending event queue. SQLite is perfect: zero-config, reliable, and handles 10,000+ user records with sub-millisecond lookups.

- **Risks:** Limited concurrent write throughput → adequate for single-device use; event queue is append-only
- **License/Cost:** Public domain, free
- **Sync protocol:** Server pushes delta updates via MQTT `cfg.person_sync`; device acks with local DB version. Full sync on provisioning. Incremental sync via cursor token. Priority sync for blacklist changes (QoS 2, immediate).

### Server Database: **TimescaleDB** (PostgreSQL + time-series)

One database for both relational (users, access rules, tenants) and time-series (events, sensors). Fewer moving parts for on-premise. Continuous aggregates handle dashboard queries. Full PostgreSQL compatibility.

- **Risks:** Single-node scale limits at ~1B+ rows → add ClickHouse for analytics in Phase 3
- **License/Cost:** Apache 2.0 (community edition), free. Enterprise multi-node ~$2K/mo if needed
- **Hiring (VN):** PostgreSQL skills abundant
- **Migration path:** Standard PostgreSQL — can migrate to CockroachDB or Citus if needed

### Cache: **Valkey**

Linux Foundation's Redis fork (BSD license). API-identical to Redis. Backed by AWS, Google, Oracle.

- **Risks:** Younger project → massive corporate backing de-risks this
- **License/Cost:** BSD, free
- **Hiring (VN):** Redis skills transfer 100%
- **Migration path:** Drop-in Redis replacement, bidirectional

### MQTT Broker: **EMQX**

Purpose-built MQTT 5.0 broker with built-in rule engine for routing IoT messages to databases/services. Handles 100M+ connections.

- **Risks:** Erlang-based, hard to customize → rule engine covers most needs without code changes
- **License/Cost:** Apache 2.0 (open source), free. Enterprise ~$3K/mo if needed
- **Hiring (VN):** No Erlang needed — configure, don't code
- **Migration path:** Standard MQTT protocol — swap to VerneMQ, HiveMQ, or Mosquitto

### Event Bus: **NATS + JetStream**

20MB binary, microsecond latency. JetStream provides durable messaging for audit events. Perfect for on-premise resource constraints.

- **Risks:** Smaller community than Kafka → adequate for our scale; can add Kafka later
- **License/Cost:** Apache 2.0, free
- **Migration path:** Add Kafka alongside for analytics streaming if needed

### Video Proxy: **go2rtc**

Zero-decode RTSP→WebRTC passthrough. Embedded as Go library. Powers Frigate internally.

- **Risks:** Smaller project → MIT license, can fork if needed; simple enough to replace
- **License/Cost:** MIT, free
- **Migration path:** MediaMTX as drop-in alternative

### LLM Inference: **Ollama → vLLM**

Ollama for easy Phase 1 deployment. Qwen2.5 models for Vietnamese language. Migrate to vLLM when concurrent users increase.

- **Risks:** On-premise LLM quality vs cloud → start with 7B models, GPU optional; cloud API fallback option
- **License/Cost:** MIT/Apache 2.0, free. Models: Apache 2.0 (Qwen2.5)
- **Migration path:** OpenAI-compatible API — swap backend without app changes

### API Gateway: **Traefik**

Auto-discovers Docker/K8s services. Built-in Let's Encrypt, JWT, rate limiting. Works identically in Docker Compose and Kubernetes.

- **License/Cost:** MIT, free
- **Migration path:** Standard reverse proxy — swap to Kong, Nginx, or Caddy

### Monitoring: **Prometheus + Grafana + Loki**

Industry standard. All open source. Single stack for metrics, dashboards, and logs.

- **License/Cost:** Apache 2.0 / AGPL (Grafana), free
- **Migration path:** OpenTelemetry standards allow switching to any observability platform

---

## 2. Build vs Buy

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Access control engine | **BUILD** | Core IP, competitive advantage |
| Video analytics (AI) | **BUILD** | Differentiator, on-premise requirement |
| AI Assistant | **BUILD** (on open models) | Domain-specific, privacy requirement |
| Identity/SSO | **BUY/USE** Keycloak | Solved problem, Apache 2.0 |
| MQTT broker | **USE** EMQX | Best-in-class, don't reinvent |
| Video streaming proxy | **USE** go2rtc | Solved problem |
| Payment/billing | **BUY** (Stripe/VNPay) | Not core business |
| SMS/Email notifications | **BUY** (Twilio/local providers) | Commodity service |
| Face recognition model | **USE** InsightFace | Apache 2.0, proven accuracy |
| LPR | **BUILD** on PaddleOCR | Needs Vietnam plate customization |

---

## 3. Infrastructure Cost Estimates

### On-Premise (customer pays hardware)

| Tier | Spec | Covers | Est. Hardware Cost |
|------|------|--------|--------------------|
| **Small** (1 building, <500 users) | 8-core, 32GB RAM, 1TB SSD, no GPU | 50 doors, 32 cameras, basic AI | ~$2,000–3,000 |
| **Medium** (5 buildings, <5K users) | 16-core, 64GB RAM, 2TB SSD, 1x GPU | 200 doors, 128 cameras, full AI | ~$8,000–12,000 |
| **Large** (campus, <50K users) | 3-node cluster, 128GB each, 2x GPU | 1000+ doors, 500+ cameras, HA | ~$30,000–50,000 |

**Software license to customer:** $0 open-source infra cost → margin is 100% on our software license.

### Cloud SaaS (Duall operates)

| Scale | Monthly Cloud Cost | Notes |
|-------|--------------------|-------|
| **Startup** (10 tenants) | $500–800/mo | 3-node K8s, managed DB |
| **Growth** (100 tenants) | $3,000–5,000/mo | Auto-scaling, HA DB, CDN |
| **Scale** (500+ tenants) | $10,000–20,000/mo | Multi-region, GPU instances for AI |

### Development Infrastructure

| Item | Monthly Cost |
|------|-------------|
| GitHub/GitLab | $200 |
| CI/CD (GitHub Actions) | $300 |
| Staging environment | $500 |
| Dev tools & licenses | $200 |
| **Total dev infra** | **~$1,200/mo** |

---

## 4. Team Composition

### Phase 1 Team (Months 1–10): 12 people

| Role | Count | Monthly Cost (VN) | Notes |
|------|-------|--------------------|-------|
| Tech Lead / Architect | 1 | $3,000–4,000 | Go + system design experience |
| Backend Engineers (Go) | 3 | $1,500–2,500 ea | Can retrain from Java/Node |
| Frontend Engineer (React) | 2 | $1,500–2,500 ea | Dashboard + admin UI |
| Mobile Engineer (Flutter) | 2 | $1,200–2,000 ea | Admin + Resident apps |
| AI/ML Engineer (Python) | 1 | $2,000–3,000 | Video analytics + LLM integration |
| DevOps Engineer | 1 | $1,500–2,500 | Docker, K8s, CI/CD |
| QA Engineer | 1 | $800–1,200 | Automation + manual |
| Product/Project Manager | 1 | $1,500–2,500 | |

**Estimated monthly payroll: $20,000–32,000** (VN market rates)

### Phase 2 Additions (+4 people)
- +1 AI/ML Engineer (video analytics scale)
- +1 Backend Engineer
- +1 Frontend Engineer
- +1 QA Engineer

### Phase 3 Additions (+2–3 people)
- +1 SRE / Platform Engineer
- +1 Data Engineer (ClickHouse, analytics)
- +1 Security Engineer (optional)

---

## 5. Technology Roadmap

### Phase 1: Foundation (Months 1–10)
**Goal:** Core access control platform, MVP launch

- Go microservices: Access Control, Identity, Device Gateway, Auth (Keycloak)
- React dashboard: live events, door management, user management
- Flutter: Resident app (mobile credentials, visitor management)
- TimescaleDB + Valkey + EMQX + NATS
- Docker Compose deployment (on-premise)
- go2rtc for basic live camera view
- Basic AI: Ollama + Qwen2.5 for AI assistant (building security Q&A)

### Phase 2: Intelligence (Months 8–16)
**Goal:** AI features, multi-site, cloud SaaS

- Video analytics: face recognition, LPR, object detection (ONNX Runtime)
- Anomaly detection on access patterns
- Flutter: Admin app (security monitoring)
- K3s deployment for HA on-premise
- Cloud SaaS multi-tenant deployment (managed K8s)
- Advanced dashboard: drag-drop builder, floor plans
- vLLM for production LLM inference
- Mobile credentials via BLE

### Phase 3: Scale (Months 14–24)
**Goal:** Enterprise features, analytics, marketplace

- ClickHouse for heavy analytics & reporting
- Predictive maintenance models
- API marketplace / third-party integrations
- Multi-region cloud deployment
- Advanced automation engine (IFTTT-like rules)
- Energy management & smart building integrations (BACnet/Modbus)
- White-label capability

---

## 6. Key Risks & Mitigations Summary

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Go hiring difficulty | Medium | Medium | Train Java devs (2-3 weeks); Go community growing fast in VN |
| On-premise LLM too slow | Medium | Medium | Start with small models; offer cloud API fallback; GPU optional upgrade |
| TimescaleDB scale ceiling | Low | Low | ClickHouse for analytics offload; designed as separate concern |
| Flutter BLE limitations | High | Low | Platform channels to native code for critical BLE features |
| EMQX open-source missing features | Low | Low | Enterprise tier available; or bridge to commercial MQTT if needed |
| Team velocity with new stack | Medium | Medium | Phase 1 uses simpler deployment (Docker Compose); complexity grows with team skill |

---

## 7. Frontend Vertical Strategy (Decision 2026-03-29)

**Approach:** Shared Core + Fork per Vertical. One backend, domain-specific frontends.

### Structure

```
dm3/
├── packages/
│   ├── ui/            ← @dm3/ui — shadcn + custom components, shared by ALL apps
│   └── api-client/    ← @dm3/api-client — generated types + hooks from OpenAPI
├── apps/
│   ├── console/       ← Master app (all modules, reference implementation)
│   ├── school/        ← Fork: attendance + identity, terminology: Student/Parent
│   ├── factory/       ← Fork: attendance + maintenance, shift management
│   └── apartment/     ← Fork: visitor + parking + intercom, resident portal
├── backend/           ← 1 backend, NEVER fork. Feature flags per tenant.
└── turbo.json         ← Turborepo orchestration
```

### Rules
- **Backend** = 1 codebase forever. Vertical differences via `modules[]` + `vertical` in company config
- **`@dm3/ui`** and **`@dm3/api-client`** = only 2 shared packages. All apps depend on these
- **Vertical apps** = fork from console/, customize freely (pages, layout, flows, terminology)
- Fix shared components → fix in packages/, all verticals get update
- Fix vertical-specific UI → fix in that app only, no cross-impact

### Rationale
In the AI coding era, **fork + customize < maintaining complex abstractions**. Backend stays unified (DB/MQTT/security too complex to fork). Frontend is visual — each vertical just needs different pages/flows. AI agents can fork + customize a new vertical in 1-2 days.

### Backend Support
Company config extends with `vertical`, `modules[]`, `terminology`, `branding` — all frontend-consumed, backend APIs stay canonical.

### Creating a New Vertical
1. Fork `apps/console/` → `apps/{vertical}/`
2. Remove unused feature folders
3. Customize terminology + dashboard
4. Add vertical-specific pages if needed
5. Estimated: 1-2 days with AI agent

---

## 8. Decision Required

**Approve this stack to begin Phase 1 hiring and development.**

Key decisions for CEO:
1. ✅ or ❌ **Go as primary language** (vs safer Java choice — higher memory, larger hiring pool)
2. ✅ or ❌ **React vs Vue** for frontend (both viable; React recommended for ecosystem)
3. ✅ or ❌ **Team size of 12** for Phase 1 (~$25K/mo payroll)
4. ✅ or ❌ **On-premise first** strategy (vs cloud-only like Verkada/Brivo)

**Total Phase 1 investment estimate:** ~$250K–320K (10 months × team + infra + overhead)

---

*Based on research: duall-master-tech-stack-research.md | Kanban: task-1771437352*
