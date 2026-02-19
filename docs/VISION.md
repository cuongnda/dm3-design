# Duall Master 3.0 — Product Vision

**Document Type:** Product Vision  
**Version:** 2.0  
**Date:** February 2026  
**Owner:** Duali Vietnam

---

## 1. Vision Statement

> **Duall Master 3.0 is the unified platform for building security and facility management — the operating system that connects, monitors, and automates everything in a building.**

From a single office to a military campus, from a residential tower to a hospital — one platform to manage it all.

---

## 2. The Transformation

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│     TODAY                                    TOMORROW               │
│                                                                     │
│   ┌─────────────┐                        ┌─────────────────┐       │
│   │   Access    │                        │   DUALL MASTER  │       │
│   │   Control   │          →→→           │       3.0       │       │
│   │   System    │                        │                 │       │
│   └─────────────┘                        │  Building OS    │       │
│                                          └─────────────────┘       │
│   • Single function                      • Unified platform        │
│   • Hardware-centric                     • Software + services     │
│   • One-time sales                       • Recurring revenue       │
│   • Easy to replace                      • Mission-critical        │
│   • Desktop-first                        • Mobile-first            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Target Markets

Duall Master 3.0 serves any facility that needs security and operational management:

| Segment | Scale | Key Needs |
|---------|-------|-----------|
| **Office Buildings** | 50 – 5,000 people | Access control, visitor, attendance, CCTV |
| **Residential (Apartments)** | 100 – 2,000 units | Intercom, parking, visitor, resident app |
| **Industrial (Factories)** | 500 – 10,000 people | Access, attendance, parking, CCTV, safety |
| **Government & Military** | Varies | High security, audit trails, centralized mgmt, data sovereignty |
| **Education (Schools)** | 500 – 5,000 students | Attendance, access, emergency, parent alerts |
| **Healthcare (Hospitals)** | 200 – 2,000 staff | Access control, visitor, pharmacy security |
| **Mixed-Use Complexes** | Multiple buildings | Multi-site, diverse needs, unified control |
| **Commercial Real Estate** | Multiple tenants | Tenant portal, shared amenities, ESG reporting |

---

## 4. Platform Architecture

Duall Master 3.0 is organized into **three core domains**, a **cross-cutting intelligence layer**, and a **technical platform foundation**.

```
╔═══════════════════════════════════════════════════════════════════╗
║                       DUALL MASTER 3.0                           ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  🧠 SMART ─────────────────────────────────────────────────────  ║
║  Unified Dashboard · Analytics · AI Assistant · Automation        ║
║  Predictive Intelligence · Emergency Management                   ║
║  (enriches everything below)                                      ║
║                                                                   ║
║  ┌─────────────────┬──────────────────┬─────────────────────┐    ║
║  │  🔒 SECURE       │  👤 MANAGE        │  🏢 OPERATE          │    ║
║  │                 │                  │                     │    ║
║  │  Protect the    │  Handle all      │  Run the            │    ║
║  │  building       │  people          │  facility           │    ║
║  │                 │                  │                     │    ║
║  │  Access Control │  Identity Mgmt   │  Room Booking       │    ║
║  │  CCTV / Video   │  Visitor Mgmt    │  Parking Mgmt       │    ║
║  │  Intrusion Det. │  Contractor Mgmt │  Maintenance        │    ║
║  │  Intercom       │  Time & Attend.  │  Guard Tour         │    ║
║  │  AI Threat Det. │  Delivery Mgmt   │  Key Management     │    ║
║  │  Emergency      │  Access Provis.  │  IoT & Energy       │    ║
║  └─────────────────┴──────────────────┴─────────────────────┘    ║
║                                                                   ║
║  ⚙️ PLATFORM ──────────────────────────────────────────────────  ║
║  Cybersecurity · API & Integrations · Mobile App · SSO            ║
║  Multi-site Management · Cloud / Multi-tenancy                    ║
║  (powers everything above)                                        ║
║                                                                   ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │                      DEVICE LAYER                            │ ║
║  │  Readers · Cameras · Intercoms · Sensors · Barriers · Lifts  │ ║
║  └─────────────────────────────────────────────────────────────┘ ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Why This Architecture?

| Principle | Explanation |
|-----------|-------------|
| **Three domains map to three buyers** | SECURE → Security Director · MANAGE → HR/Admin · OPERATE → Facility Manager |
| **SMART is cross-cutting** | AI and analytics enrich all domains — not siloed in one layer |
| **PLATFORM is foundational** | Cybersecurity, APIs, and mobile aren't features — they're infrastructure |
| **Clean separation** | Threats (Secure) vs People (Manage) vs Spaces & Assets (Operate) — no overlap |

---

## 5. Domain: 🔒 SECURE — Protect the Building

Everything that detects, prevents, or responds to physical security threats.

### 5.1 Access Control System

The foundation — controlling who goes where.

| Feature | Description |
|---------|-------------|
| **Multi-point Control** | Doors, gates, turnstiles, lifts, barriers |
| **Multi-credential Support** | Face, fingerprint, card, PIN, QR code, mobile BLE |
| **Access Rules** | Time-based, zone-based, anti-passback, interlocking |
| **Real-time Monitoring** | Live door status, access events, alerts |
| **Emergency Modes** | Fire unlock, lockdown, evacuation |
| **Mobile Unlock** | BLE/NFC phone-as-credential — primary access method |

### 5.2 CCTV / Video Surveillance

Unified video surveillance management.

| Feature | Description |
|---------|-------------|
| **Multi-brand Support** | Hikvision, Dahua, Hanwha, ONVIF-compatible |
| **Live View** | Multi-camera grid, PTZ control, digital zoom |
| **Playback & Search** | Timeline, event-based, smart search |
| **Event Linking** | Access events linked to video clips |
| **Recording Management** | NVR status, storage alerts, health monitoring |

### 5.3 AI Threat Detection

Intelligent video analytics via 3rd party AI integration.

| Event Type | Examples |
|------------|----------|
| **Intrusion** | Perimeter breach, restricted area entry |
| **Behavior** | Loitering, fighting, running, falling |
| **Object** | Abandoned bag, missing object, vehicle |
| **Counting** | People counting, crowd detection, queue length |
| **Recognition** | Face match, license plate, uniform detection |
| **Anomaly** 🆕 | Unusual access patterns, off-hours activity, tailgating detection |

### 5.4 Intrusion Detection

Alarm system integration and perimeter protection.

| Feature | Description |
|---------|-------------|
| **Alarm Zones** | Arm/disarm zones, scheduled arming |
| **Sensor Integration** | Motion, door contact, glass break, vibration |
| **Alarm Response** | Auto-alert guards, trigger CCTV recording, lockdown |
| **Perimeter Protection** | Fence sensors, beam detectors, thermal cameras |

### 5.5 Intercom & Communications

Communication between entrance and resident/staff.

| Component | Features |
|-----------|----------|
| **Door Station** | Video call, unlock, PIN pad, card reader |
| **Indoor Monitor** | Answer calls, view CCTV, control doors |
| **Guard Station** | Multi-call handling, building-wide announcements |
| **Mobile App** | Answer anywhere, remote unlock, call history |
| **SIP Integration** | Works with existing phone/PBX systems |

### 5.6 Emergency & Lockdown

Coordinated emergency response.

| Mode | Actions |
|------|---------|
| **Fire Evacuation** | Unlock exits, recall lifts, audio announcement, mobile alerts |
| **Lockdown** | Lock all perimeter, disable normal access, alert security |
| **Medical Emergency** | Unlock path to medical room, alert first-aiders |
| **Intruder Alert** | Lock specific zones, silent alarm, video tracking |
| **Custom Scenarios** | Configurable response plans per emergency type |

---

## 6. Domain: 👤 MANAGE — Handle All People

Managing every person who enters the building — employees, visitors, contractors, delivery personnel.

### 6.1 Identity Management

Central registry for all people in the system.

| Feature | Description |
|---------|-------------|
| **Unified Identity** | One profile per person across all modules |
| **Credential Management** | Assign/revoke cards, biometrics, mobile credentials |
| **Role-based Access** | Template-based access provisioning per role |
| **HR Integration** | Auto-sync from HR systems — hire/transfer/terminate |
| **Self-service Portal** | Users manage their own profile, credentials, requests |

### 6.2 Visitor Management

Professional visitor handling from pre-registration to departure.

| Feature | Description |
|---------|-------------|
| **Pre-registration** | Invite via email/SMS with QR code |
| **Check-in Options** | Android Terminal, reception, self-service tablet |
| **Badge Printing** | Photo badges, visitor type, expiry |
| **Host Notification** | Auto-notify host when visitor arrives |
| **Watchlist** | Blacklist, VIP list, alerts |
| **Visitor Log** | Full audit trail, reports, compliance |

### 6.3 Contractor Management

Temporary workers with compliance requirements.

| Feature | Description |
|---------|-------------|
| **Contractor Registration** | Company, workers, validity period |
| **Compliance Tracking** | Safety training, certifications, insurance |
| **Temporary Access** | Time-limited credentials, zone restrictions |
| **Check-in/out** | Daily logging, time tracking |

### 6.4 Time & Attendance

Employee time and attendance tracking.

| Feature | Description |
|---------|-------------|
| **Clock-in Methods** | Face, fingerprint, card, mobile |
| **Shift Management** | Shift schedules, rotation, assignment |
| **Overtime Tracking** | Auto-calculation, approval workflow |
| **Leave Integration** | Sync with leave system |
| **Reports** | Daily, monthly, custom reports |
| **Mobile Clock-in** 🆕 | GPS-verified mobile attendance for field workers |

### 6.5 Delivery Management

Package and delivery tracking (for residential/office).

| Feature | Description |
|---------|-------------|
| **Delivery Logging** | Photo capture, recipient info |
| **Notification** | Alert resident/staff of arrival |
| **Locker Integration** | Smart parcel locker support |
| **Collection Tracking** | Pickup confirmation, uncollected alerts |

### 6.6 Access Provisioning

Who gets access to what — the policy engine.

| Feature | Description |
|---------|-------------|
| **Role Templates** | Pre-defined access profiles per job role |
| **Request & Approval** | Self-service access requests with manager approval |
| **Temporary Access** | Time-bound access for projects, events |
| **Auto-provisioning** | New hire → automatic access based on department/role |
| **Auto-deprovision** | Termination → instant revocation across all systems |
| **Audit Trail** | Complete history of who approved what access when |

---

## 7. Domain: 🏢 OPERATE — Run the Facility

Day-to-day building operations, spaces, and assets.

### 7.1 Room & Resource Booking

Meeting room and facility reservations.

| Feature | Description |
|---------|-------------|
| **Room Booking** | Meeting rooms, training rooms |
| **Resource Booking** | Equipment, vehicles, amenities |
| **Calendar Integration** | Outlook, Google Calendar sync |
| **Access Link** | Auto-grant access for booking period |
| **Display Integration** | Room status on door displays |
| **No-show Detection** 🆕 | Auto-release rooms if no one shows up (via sensors) |

### 7.2 Parking Management

Vehicle access and parking control.

| Feature | Description |
|---------|-------------|
| **Vehicle Types** | Cars, motorbikes, bicycles |
| **Access Methods** | LPR (license plate), card, QR, monthly pass |
| **Barrier Control** | Entry/exit barriers, boom gates |
| **Space Management** | Occupancy tracking, guidance, reservations |
| **Payment Integration** | Fee calculation, payment gateways, invoicing |
| **EV Charging** 🆕 | Electric vehicle charger management & billing |

### 7.3 Maintenance & Work Orders

Work orders and asset maintenance.

| Feature | Description |
|---------|-------------|
| **Work Orders** | Create, assign, track, close |
| **Preventive Maintenance** | Scheduled maintenance tasks |
| **Asset Registry** | Equipment database, service history |
| **Vendor Management** | Service provider contacts, contracts |
| **Mobile Work Orders** 🆕 | Technicians receive and update from phone |
| **AI Predictive Maintenance** 🆕 | Predict device failures before they happen |

### 7.4 Guard Tour & Patrol

Security patrol management.

| Feature | Description |
|---------|-------------|
| **Route Planning** | Define patrol routes, checkpoints |
| **Tour Execution** | NFC/QR checkpoint scanning via mobile |
| **Real-time Tracking** | GPS/indoor location tracking |
| **Incident Reporting** | Log incidents during patrol with photo/video |
| **Compliance Reports** | Missed checkpoints, late patrols |

### 7.5 Key Management

Physical key and asset checkout.

| Feature | Description |
|---------|-------------|
| **Key Cabinet Integration** | Electronic key cabinets |
| **Checkout/Return** | Log who has which key |
| **Overdue Alerts** | Keys not returned on time |
| **Audit Trail** | Complete key movement history |

### 7.6 IoT Sensors & Energy Management

Environmental monitoring and smart building capabilities.

| Sensor Type | Application |
|-------------|-------------|
| **Temperature** | HVAC monitoring, cold room alerts |
| **Humidity** | Server room, storage areas |
| **Air Quality (AQI)** | CO2, PM2.5, VOC levels |
| **Water Leak** | Server room, basement, bathroom |
| **Smoke/Fire** | Fire alarm integration |
| **Motion/Occupancy** | Energy saving, room utilization |

#### Energy Management 🆕

| Feature | Description |
|---------|-------------|
| **Energy Monitoring** | Real-time power consumption per zone/floor |
| **Smart Scheduling** | HVAC/lighting automation based on occupancy |
| **Usage Reports** | Energy cost allocation per tenant/department |
| **ESG Reporting** | Sustainability metrics, carbon footprint tracking |
| **Alert Thresholds** | Abnormal consumption alerts |
| **Green Building Score** | Dashboard widget for sustainability KPIs |

---

## 8. Layer: 🧠 SMART — Intelligence & AI

Cross-cutting AI and analytics that enriches all three domains.

### 8.1 Unified Dashboard

Single pane of glass for building operations.

| Feature | Description |
|---------|-------------|
| **Real-time Overview** | Live status of all systems |
| **Alert Management** | Prioritized alerts, acknowledgment, escalation |
| **Custom Widgets** | Drag-drop dashboard builder |
| **Role-based Views** | Different dashboards per role |
| **Multi-site View** | Aggregate view of all locations |
| **Mobile Dashboard** 🆕 | Full dashboard experience on phone/tablet |

### 8.2 Analytics & Reports

Turn data into insights.

| Report Type | Examples |
|-------------|----------|
| **Access Analytics** | Peak hours, door utilization, denied access trends |
| **Visitor Analytics** | Visitor volume, average visit duration, host ranking |
| **Attendance Analytics** | Punctuality, absenteeism, overtime patterns |
| **Occupancy Analytics** | Space utilization, peak occupancy times |
| **Security Analytics** | Incident trends, alarm frequency, response times |
| **Energy Analytics** 🆕 | Consumption patterns, cost trends, sustainability metrics |
| **Device Health** 🆕 | Uptime, failure predictions, maintenance needs |

### 8.3 On-Premise AI Assistant 🆕

Natural language interface for operating the entire system.

| Capability | Examples |
|------------|----------|
| **Query & Search** | "Who entered Building A today?" "Show visitors waiting" |
| **Commands** | "Open Gate 2" "Lock down Floor 3" "Approve the visitor" |
| **Reports** | "Generate attendance report for last week" |
| **Troubleshooting** | "Door 5 is not responding, what should I check?" |
| **Voice Control** | "Hey Duall, show camera 5 on main screen" (Guard Station) |

| Deployment | Description |
|------------|-------------|
| **On-Premise** | LLM runs locally — no cloud dependency, data stays private |
| **Multi-interface** | Web Console, Guard Station (voice), Mobile App |
| **Multi-language** | Vietnamese and English natural language support |
| **Permission-aware** | AI respects user roles — guards can't do admin actions |

**Why On-Premise AI?**
- 🔒 Data privacy — access logs, faces, visitor data never leave the building
- ⚡ Low latency — real-time responses without internet dependency
- 🏛️ Compliance — meets government/military data sovereignty requirements
- 💰 Predictable cost — no per-query API fees

### 8.4 AI-Powered Anomaly Detection 🆕

Proactive threat detection using machine learning.

| Capability | Description |
|------------|-------------|
| **Access Anomalies** | Unusual patterns — wrong time, wrong zone, frequency spikes |
| **Behavioral Patterns** | Detect deviations from normal routines |
| **Insider Threat Signals** | After-hours access, unusual data room visits |
| **Auto-escalation** | Anomalies auto-generate alerts for security review |

### 8.5 Predictive Intelligence 🆕

AI that predicts and prevents before problems occur.

| Capability | Description |
|------------|-------------|
| **Device Failure Prediction** | Predict reader/camera failures before they happen |
| **Occupancy Forecasting** | Predict building load for resource planning |
| **Security Risk Scoring** | Dynamic risk scores for zones and time periods |
| **Maintenance Scheduling** | AI-optimized preventive maintenance timing |

### 8.6 Automation Engine

If-this-then-that rules for building automation.

| Trigger | → | Action |
|---------|---|--------|
| Fire alarm activated | → | Unlock all exit doors, recall lifts, alert all |
| VIP face detected | → | Open fast lane, notify reception |
| After-hours access | → | Capture photo, alert security guard |
| Temperature > threshold | → | Alert maintenance, log event |
| Parking 90% full | → | Display "ALMOST FULL" on signage |
| Stranger loitering > 5min | → | Alert guard, record video clip |
| Energy consumption spike | → | Alert facility manager, auto-adjust HVAC |
| Device offline > 10min | → | Alert IT, create work order |

---

## 9. Layer: ⚙️ PLATFORM — Technical Foundation

The infrastructure that powers everything.

### 9.1 Cybersecurity 🆕

Enterprise-grade security for the platform itself.

| Feature | Description |
|---------|-------------|
| **End-to-end Encryption** | TLS 1.3 for all communications, AES-256 at rest |
| **Zero-Trust Architecture** | Verify every request, least-privilege access |
| **Audit Logging** | Immutable logs for all admin actions |
| **Vulnerability Management** | Regular security scanning, patch management |
| **Compliance Roadmap** | SOC2 Type II, ISO 27001 certification path |
| **Penetration Testing** | Annual 3rd-party security audits |
| **Data Sovereignty** | Data residency controls — stays in-country |

### 9.2 API & Integrations

#### Device Protocols
| Protocol | Devices |
|----------|---------|
| **ONVIF** | IP cameras, NVRs |
| **SIP** | Video intercom |
| **Wiegand/OSDP** | Access readers |
| **RS-485/TCP** | Controllers, barriers |
| **Zigbee/Z-Wave** | IoT sensors |
| **BACnet/Modbus** | BMS systems |

#### Enterprise Integrations
| System | Integration |
|--------|-------------|
| **HR Systems** | Auto-provision/deprovision users |
| **ERP** | Asset management sync |
| **Active Directory / LDAP** | User authentication & sync |
| **Calendar** | Room booking sync (Outlook, Google) |
| **Messaging** | Telegram, Zalo, SMS alerts |
| **Payment** | Parking fees, facility charges |
| **BMS** | Building management system integration |

#### Open API
RESTful API for custom integrations:
- Authentication (OAuth 2.0)
- User & access management
- Event streaming (webhooks)
- Device control
- Report generation
- Rate limiting & usage tracking

### 9.3 Mobile App — Primary Interface 📱

In 2026, guards, managers, and residents live on their phones. Mobile is the **primary** interface, not secondary.

#### Admin / Security Mobile App
| Feature | Description |
|---------|-------------|
| **Real-time Alerts** | Push notifications for all events |
| **Remote Door Control** | Open/lock doors from anywhere |
| **Visitor Approval** | Approve/deny visitors on the go |
| **Live Camera View** | View cameras from phone |
| **Incident Logging** | Report incidents with photo/location |
| **Guard Tour** | Complete patrols using phone |
| **Dashboard** | Full dashboard on mobile |
| **AI Assistant** | Voice/text commands on mobile |

#### Resident / Tenant Mobile App
| Feature | Description |
|---------|-------------|
| **Digital Keys** | BLE/QR unlock — phone replaces card |
| **Visitor Invitations** | Invite visitors, share QR codes |
| **Intercom Calls** | Answer door calls from anywhere |
| **Package Notifications** | Delivery alerts and pickup |
| **Facility Booking** | Book rooms, amenities |
| **Maintenance Requests** | Submit and track requests |
| **Building Announcements** | News, alerts, community updates |
| **Parking** | Find spot, pay fees, EV charging |

### 9.4 SSO & Authentication

| Feature | Description |
|---------|-------------|
| **Single Sign-On** | SAML 2.0, OAuth 2.0, OpenID Connect |
| **Active Directory** | LDAP / Azure AD integration |
| **Multi-factor Auth** | MFA for admin and web access |
| **API Keys** | Secure tokens for system integrations |

### 9.5 Multi-site Management

| Feature | Description |
|---------|-------------|
| **Centralized Control** | Manage all sites from one console |
| **Site Hierarchy** | Region → City → Building → Floor → Zone |
| **Cross-site Access** | Employees access multiple buildings |
| **Aggregated Reporting** | Portfolio-wide analytics |
| **Per-site Configuration** | Local policies with global overrides |

### 9.6 Cloud & Multi-tenancy 🆕

SaaS-specific capabilities for cloud deployments.

| Feature | Description |
|---------|-------------|
| **Multi-tenancy** | Complete data isolation between tenants |
| **Tenant Self-service** | Onboarding, configuration, billing portal |
| **Auto-scaling** | Handle load spikes without manual intervention |
| **Geo-redundancy** | Data replicated across availability zones |
| **SLA Monitoring** | Uptime dashboard, SLA compliance tracking |
| **White-labeling** | Custom branding per tenant/reseller |

---

## 10. User Interfaces

### 10.1 Web Console
Full-featured management for administrators.

- Dashboard & monitoring
- Configuration & settings
- User & access management
- Reports & analytics
- System administration
- **🤖 AI Assistant chat panel** — ask questions, execute commands in natural language

### 10.2 Mobile App (Primary Interface) 📱
See Section 9.3 for full details. The mobile app is the **primary interface** for day-to-day operations.

### 10.3 Android Terminal Interface
Self-service terminals for visitors and staff.

- Visitor self check-in
- Attendance clock-in
- Directory lookup
- Wayfinding

### 10.4 Guard Station
Dedicated interface for security personnel.

- Multi-camera live view
- Intercom call handling
- Access event monitoring
- Incident management
- Patrol dispatch
- **🎤 AI Voice Assistant** — "Hey Duall, open the main gate" / "Show camera 5"

---

## 11. Deployment Options

| Model | Description | Best For |
|-------|-------------|----------|
| **On-Premise** | Installed on customer's server | High security (govt, military, banks) |
| **Cloud (SaaS)** | Hosted by Duali, multi-tenant | SMB, residential, fast deployment |
| **Hybrid** | Local server + cloud backup & analytics | Large enterprise, data sovereignty with cloud benefits |

### Cloud (SaaS) Details 🆕
- Multi-tenant architecture with complete data isolation
- Auto-provisioning — new customers live in hours, not weeks
- Automatic updates — all tenants get latest features
- Usage-based billing — pay for what you use
- 99.9% uptime SLA with geo-redundant infrastructure

---

## 12. Competitive Differentiation

### What Makes Duall Master 3.0 Different

| Traditional Approach | Duall Master 3.0 Approach |
|---------------------|---------------------------|
| Hardware-centric vendors | **Software platform** that works with multiple hardware |
| Siloed point solutions | **Unified platform** — one system for everything |
| Complex enterprise tools | **Mid-market simplicity** with enterprise features |
| Rigid configurations | **Flexible automation** — customers build their own rules |
| Closed ecosystems | **Open integrations** — works with existing systems |
| Western premium pricing | **Competitive pricing** with enterprise-grade quality |
| Cloud-only or on-prem-only | **Any deployment** — on-prem, cloud, or hybrid |
| Basic reporting | **AI-powered intelligence** — anomaly detection, predictions, natural language |

### Competitive Positioning

| Competitor Category | Their Weakness | Duall Master 3.0 Advantage |
|-------------------|----------------|---------------------------|
| **Global enterprise** (access + video) | Expensive, complex, requires consultants | Simpler to deploy, local support, lower TCO |
| **Cloud-native startups** (access only) | Limited scope — access control only, no video | Full platform — security + people + facilities |
| **Chinese hardware brands** | Trust issues, data sovereignty concerns, limited software | Software-first, transparent security, local ownership |
| **Building management systems** | Weak security features, not security-first | Security DNA with facility operations built in |
| **Point solution vendors** | Customer needs 5+ systems to cover what we do in one | Single platform, single vendor, single pane of glass |

### Unique Value Propositions

1. **All-in-One Platform** — No need to buy 5 different systems
2. **Flexible & Customizable** — Adapts to any building type
3. **Open Architecture** — Integrates with existing investments
4. **Local Support** — Vietnam-based team, Vietnamese interface
5. **Growing with Customers** — Start simple, add modules as needed
6. **🤖 AI-Powered Operations** — On-premise AI assistant, anomaly detection, predictive intelligence
7. **📱 Mobile-First** — Guards and managers run buildings from their phones
8. **🔒 Cybersecurity Built-in** — Zero-trust, encryption, compliance-ready
9. **🌱 Green Building Ready** — Energy monitoring and ESG reporting included

---

## 13. Business Model

### Revenue Streams

| Stream | Model |
|--------|-------|
| **Software License** | Per-door or per-user licensing |
| **Device License** 🆕 | Per-camera, per-sensor licensing for connected devices |
| **Hardware** | Readers, controllers, intercom devices |
| **Implementation** | Installation, configuration, training |
| **Support & Maintenance** | Annual maintenance contracts |
| **Cloud Subscription** | Monthly SaaS fee (cloud deployments) |
| **Resident App** | Per-unit monthly fee (apartments) |
| **AI Features** 🆕 | Usage-based pricing for AI Assistant & analytics |
| **API Usage** | High-volume API access fees |

### Pricing Tiers

| Tier | Modules Included | Target | AI Level |
|------|------------------|--------|----------|
| **Starter** | Access + Attendance | Small offices | Basic analytics |
| **Professional** | + Visitor + Parking + Intercom | Medium buildings | Standard reports |
| **Enterprise** | Full suite + AI Assistant + Predictive Intelligence | Large complexes | **Full AI-powered** 🆕 |

**Enterprise tier differentiator:** AI is the premium feature — anomaly detection, predictive maintenance, natural language assistant, and automation engine are Enterprise-only capabilities.

---

## 14. Success Metrics

### Platform Adoption
- Number of buildings deployed
- Number of active users
- Modules per building (land & expand)
- Monthly active users (mobile app)
- Mobile vs web usage ratio (target: 60%+ mobile)

### Technical Excellence
- Platform uptime (target: 99.5%+ on-prem, 99.9% cloud)
- API response time (< 200ms p95)
- Mobile app rating (target: 4.5+ stars)
- Support ticket resolution time
- Zero critical security vulnerabilities

### Business Impact
- Revenue per building
- Customer retention rate
- Net Promoter Score (NPS)
- Recurring revenue percentage (target: 40%+)
- AI feature adoption rate

---

## 15. Roadmap

### Phase 1: Foundation (2026 H1)
- Core SECURE domain (Access, CCTV, Intercom)
- Core MANAGE domain (Visitors, Identity, Attendance)
- Mobile app v1 (Admin + Resident)
- Web console with dashboard
- On-premise deployment

### Phase 2: Expansion (2026 H2)
- Full OPERATE domain (Parking, Maintenance, Guard Tour, IoT)
- Cloud SaaS launch with multi-tenancy
- AI Assistant (on-premise)
- Automation engine
- Energy monitoring

### Phase 3: Intelligence (2027 H1)
- AI anomaly detection
- Predictive maintenance
- Advanced analytics & BI
- Cybersecurity certifications (SOC2/ISO27001)
- Multi-site management

### Phase 4: Future Vision (2027+)
- **Digital Twin** 🆕 — 3D building visualization with real-time device status overlay
- **Tenant Portal** 🆕 — Self-service portal for commercial building tenants
- **Marketplace** — 3rd-party integrations and plugins
- **Edge AI** — AI processing on local devices for instant response
- **Robotics Integration** — Patrol robots, delivery robots
- **ESG Compliance Suite** — Full sustainability reporting and carbon tracking

---

## 16. Summary

**Duall Master 3.0** transforms Duali from an access control vendor into a **building technology platform company**.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🔒 SECURE it.  👤 MANAGE them.  🏢 OPERATE it.  🧠 SMART. │
│                                                             │
│  One platform. Any building. Intelligent by default.        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The platform vision:
- 🔒 **SECURE** — Protect buildings with unified security
- 👤 **MANAGE** — Handle all people through one identity system
- 🏢 **OPERATE** — Run facilities efficiently with smart automation
- 🧠 **SMART** — AI-powered intelligence across everything
- ⚙️ **PLATFORM** — Enterprise-grade foundation with cybersecurity built-in
- 📱 **Mobile-first** — Guards and managers run buildings from their phones
- 🌱 **Sustainable** — Energy management and ESG reporting for green buildings

This is the future of building management. This is Duall Master 3.0.

---

*Document prepared by Cuong Nguyen — February 2026*  
*Version 2.0 — Architecture restructured to Three Domains model*
