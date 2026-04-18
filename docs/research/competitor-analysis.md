# Duall Master 3.0 — Platform Layer Architecture Analysis

**Date:** February 19, 2026  
**Purpose:** Evaluate the current 4-layer architecture and propose clearer alternatives  
**Audience:** CEO / Product Leadership

---

## Table of Contents
1. [Current Architecture & Its Problems](#1-current-architecture--its-problems)
2. [Competitor Analysis](#2-competitor-analysis)
3. [Organizing Principles](#3-organizing-principles)
4. [Proposed Architectures](#4-proposed-architectures)
5. [Recommendation](#5-recommendation)
6. [Additional Considerations](#6-additional-considerations)

---

## 1. Current Architecture & Its Problems

```
┌─────────────────────────────────────────────────────┐
│              INTELLIGENCE LAYER                      │
│  Dashboard · Analytics · AI · Automation · Emergency │
├─────────────────────────────────────────────────────┤
│              FACILITY LAYER                          │
│  Attendance · Guard Tour · Keys · Rooms · IoT · Maint│
├─────────────────────────────────────────────────────┤
│              VISITOR LAYER                           │
│  Visitor Mgmt · Contractor Mgmt · Delivery Mgmt     │
├─────────────────────────────────────────────────────┤
│              SECURITY LAYER                          │
│  Access Control · CCTV · Parking · Intercom · AI Det │
└─────────────────────────────────────────────────────┘
```

### Why it doesn't work

| Problem | Example |
|---------|---------|
| **"Visitor" isn't a domain — it's a user type** | Visitors use access control (Security Layer), book rooms (Facility Layer), get tracked (Intelligence Layer). They cross all layers. |
| **"Facility" conflates people & places** | Time Attendance tracks *people*, not facilities. Room booking is about *spaces*. Maintenance is about *assets*. Three different subjects. |
| **Layer boundaries are arbitrary** | Guard tour could be Security or Facility. Emergency could be Security or Intelligence. AI detection is in Security, but AI assistant is in Intelligence. |
| **No clear organizing principle** | Layer 1 = by function, Layer 2 = by user type, Layer 3 = by location type, Layer 4 = by technology. Mixed metaphors. |

---

## 2. Competitor Analysis

### How Top Platforms Organize Their Modules

| Platform | Organizing Principle | Module Categories |
|----------|---------------------|-------------------|
| **Genetec Security Center** | By security function (unified) | **Omnicast** (video), **Synergis** (access control), **AutoVu** (ALPR/parking), **Sipelia** (communications) — all under one unified platform with shared analytics |
| **Gallagher Command Centre** | By operational concern | **Access Control**, **Perimeter**, **Visitor Management**, **Building Management** — centered on "managing people, access, and facilities" |
| **Honeywell / LenelS2** | By technology system | **OnGuard** (access control), **NetVR/VRx** (video), **NetBox** (small-medium), **Magic Monitor** (unified client) — tech-system-centric |
| **Siemens Siveillance** | By security function + PSIM | **Siveillance Video**, **Siveillance Control** (PSIM), **SIPORT** (access + time management), **Perimeter Protection** — PSIM as orchestration layer |
| **HID SAFE** | By identity lifecycle | **Identity Management**, **Access Provisioning**, **Visitor Management**, **Facility Analytics**, **Compliance** — identity-centric |
| **Brivo** | By capability (cloud-native) | **Access Control**, **Video Surveillance**, **Visitor Management**, **Identity Management**, **Monitoring/Intrusion**, **Analytics** |
| **Verkada** | By device type | **Cameras**, **Access Control**, **Sensors**, **Alarms**, **Intercom**, **Guest** — one product per device category |

### Key Observations

1. **No major competitor uses "layers"** — they all use **modules** or **products** that plug into a unified core
2. **Visitor management is always a module**, never a "layer" — validates the CEO's instinct
3. **Identity/People management** is emerging as a cross-cutting concern (HID SAFE, Brivo)
4. **Analytics/Intelligence is always cross-cutting**, not a separate layer — it's embedded in each module (Genetec analytics in Omnicast, HID analytics in Facility Analytics)
5. **Time & Attendance** is bundled with **access control** or **identity** (Siemens SIPORT combines access + time management)

### Competitor Feature Coverage

| Feature | Genetec | Gallagher | Siemens | HID | Brivo |
|---------|---------|-----------|---------|-----|-------|
| Cybersecurity as distinct concern | ✅ Privacy-by-design | ✅ HBUS protocol | ✅ | ✅ | ✅ |
| Energy / Sustainability | ❌ | ✅ (BMS integration) | ✅ (Desigo) | ❌ | ❌ |
| Digital Twin / 3D | ✅ (Maps) | ❌ | ✅ (via BIM) | ❌ | ❌ |
| AI/ML approach | Cross-cutting (in video, analytics) | Cross-cutting | Cross-cutting | Cross-cutting | Cross-cutting |

**Key finding:** AI is universally treated as a cross-cutting capability, NOT a dedicated layer.

---

## 3. Organizing Principles Analysis

### A. By Function
> "What does the system DO?"

```
Security → Protect assets and people
Operations → Run the building day-to-day  
Intelligence → Analyze and optimize
```

**Pros:** Simple, intuitive for buyers  
**Cons:** Overlap (is visitor check-in security or operations?)

### B. By Subject
> "What is the system managing?"

```
People → Identities, access rights, attendance, visitors
Spaces → Rooms, zones, parking, perimeter
Devices → Cameras, sensors, intercoms, locks
Data → Dashboards, analytics, reports, AI
```

**Pros:** Clean separation, no overlap, scales well  
**Cons:** Less intuitive for security-first buyers ("where's my CCTV?")

### C. By Workflow / Security Lifecycle
> "When does each capability matter?"

```
Prevent → Access control, identity, provisioning
Detect → CCTV, sensors, AI detection, intrusion
Respond → Alarms, emergency, intercom, lockdown
Analyze → Dashboards, reports, forensics, optimization
```

**Pros:** Aligns with security industry thinking (NIST-like)  
**Cons:** Facility operations (maintenance, room booking) don't fit naturally

### D. By Stakeholder
> "Who uses this?"

```
Security Team → CCTV, access, alarms, guard tour
Facility Team → Maintenance, rooms, energy, IoT
Front Desk / Reception → Visitors, deliveries, intercom
Management → Dashboards, analytics, compliance
```

**Pros:** Easy to pitch to each buyer  
**Cons:** Many features serve multiple stakeholders; creates artificial walls

### Verdict on Organizing Principles

The industry trend is moving toward **hybrid: function-based pillars with identity as a cross-cutting core**. Pure subject-based (B) is the cleanest architecturally but less marketable. **The best approach combines functional grouping with identity/people as the connective tissue.**

---

## 4. Proposed Architectures

### Option A: "Three Pillars + Core" (Function-Based)

```
                    ┌─────────────────────────┐
                    │      INTELLIGENCE        │
                    │  Analytics · AI · Reports│
                    │    (cross-cutting)        │
        ┌───────────┼───────────┼─────────────┐
        │           │           │             │
   ┌────▼────┐ ┌───▼────┐ ┌───▼─────┐  ┌────▼─────┐
   │SECURITY │ │ PEOPLE │ │BUILDING │  │OPERATIONS│
   │         │ │        │ │         │  │          │
   │ CCTV    │ │Identity│ │Rooms    │  │Guard Tour│
   │ Access  │ │Visitor │ │Parking  │  │Maint.    │
   │ Intrusion│ │Attend. │ │Energy   │  │Delivery  │
   │ Intercom│ │Contract│ │IoT/Sens.│  │Key Mgmt  │
   │ AI Det. │ │        │ │         │  │          │
   └─────────┘ └────────┘ └─────────┘  └──────────┘
                    │
              ┌─────▼──────┐
              │  PLATFORM   │
              │ Cyber · API │
              │ Mobile · SSO│
              └────────────┘
```

**Pillars:**
| Pillar | What It Manages | Modules |
|--------|----------------|---------|
| **Security** | Threat prevention & detection | Access Control, CCTV, Intrusion, Intercom, AI Detection, Emergency/Lockdown |
| **People** | All user types & their lifecycle | Identity Mgmt, Visitor Mgmt, Contractor Mgmt, Time & Attendance |
| **Building** | Physical spaces & assets | Room Booking, Parking, Energy/IoT Sensors, Zones/Floors |
| **Operations** | Day-to-day workflows | Guard Tour, Maintenance, Delivery Mgmt, Key Mgmt |
| **Intelligence** *(cross-cutting)* | Data & AI across all pillars | Dashboards, Analytics, AI Assistant, Automation, Reports |
| **Platform** *(foundation)* | Technical infrastructure | Cybersecurity, API/Integrations, Mobile App, SSO |

**Pros:**
- Resolves the visitor problem — visitors are just "People" alongside employees
- Time Attendance correctly under People
- Intelligence is cross-cutting, not a separate silo
- Cybersecurity addressed at Platform level

**Cons:**
- 4 pillars + 2 layers = 6 concepts might feel heavy
- "Operations" pillar is a catch-all

---

### Option B: "Three Domains" (Simplified Function-Based)

```
    ┌──────────────────────────────────────────────────┐
    │              🧠 SMART LAYER                       │
    │    AI · Analytics · Automation · Dashboards       │
    ├──────────────┬──────────────┬────────────────────┤
    │   🔒 SECURE  │  👤 MANAGE   │   🏢 OPERATE       │
    │              │              │                    │
    │ Access Ctrl  │ Identity     │ Room Booking       │
    │ CCTV/Video   │ Visitors     │ Parking            │
    │ Intrusion    │ Contractors  │ Maintenance        │
    │ Intercom     │ Attendance   │ Guard Tour         │
    │ AI Detection │ Delivery     │ Key Mgmt           │
    │ Emergency    │              │ IoT/Energy         │
    ├──────────────┴──────────────┴────────────────────┤
    │              ⚙️ PLATFORM CORE                     │
    │    Cybersecurity · API · Mobile · Integrations    │
    └──────────────────────────────────────────────────┘
```

**Three Domains:**
| Domain | Purpose | Logic |
|--------|---------|-------|
| **SECURE** | Protect the building | Everything that detects, prevents, or responds to threats |
| **MANAGE** | Manage people & access | All user types: employees, visitors, contractors, deliveries |
| **OPERATE** | Run the building | Day-to-day facility operations and space management |

**Plus two horizontal layers:**
- **SMART** (top): AI & analytics that enriches all three domains
- **PLATFORM** (bottom): Technical foundation

**Pros:**
- ✅ Only 3 main concepts — very easy to communicate
- ✅ Clean separation: things (Secure) vs people (Manage) vs spaces (Operate)
- ✅ Matches industry: Genetec-style unified security + HID-style identity + facility ops
- ✅ Each domain maps to a buyer persona (Security Director / HR-Admin / Facility Manager)
- ✅ "Delivery" under Manage makes sense — it's about managing a user (delivery user) entering

**Cons:**
- Some modules could arguably go in two domains (guard tour = Secure or Operate?)
- "Manage" might need a stronger name

**Naming alternatives for "Manage":**
- **IDENTITY** (more specific but narrower)
- **PEOPLE** (clear but informal)
- **ACCESS** (overlaps with access control in Secure)

---

### Option C: "Subject-Based Quadrants" (Entity-Centric)

```
    ┌──────────────────┬──────────────────┐
    │    👤 PEOPLE      │   🏢 SPACES       │
    │                  │                  │
    │ Identity Mgmt    │ Room Booking     │
    │ Visitor Mgmt     │ Parking Mgmt     │
    │ Contractor Mgmt  │ Zone Management  │
    │ Time Attendance   │ Floor Plans/Maps │
    │ Delivery Mgmt    │ Energy Mgmt      │
    │ Access Rights     │ Digital Twin     │
    ├──────────────────┼──────────────────┤
    │   📷 SYSTEMS      │   📊 INSIGHTS     │
    │                  │                  │
    │ CCTV/Video       │ Dashboards       │
    │ Access Control HW│ Analytics        │
    │ Intercom         │ AI Assistant     │
    │ IoT Sensors      │ Reports          │
    │ Intrusion/Alarms │ Automation Rules │
    │ Guard Tour       │ Emergency Mgmt   │
    └──────────────────┴──────────────────┘
```

**Pros:**
- Very clean conceptual model — managing 4 types of things
- No ambiguity about where things go
- Scales well as you add features

**Cons:**
- ❌ "Systems" is vague and hardware-centric
- ❌ Emergency under Insights feels wrong
- ❌ Splits access control (rights under People, hardware under Systems) — confusing
- ❌ Less marketable — security buyers think in terms of functions, not entities

---

## 5. Recommendation

### 🏆 Option B: "Three Domains" — SECURE · MANAGE · OPERATE

**This is the recommended architecture.** Here's why:

#### 1. It solves every stated problem
| CEO's Concern | How Option B Solves It |
|---------------|----------------------|
| "Why is Visitor a separate layer?" | It's not — visitors are under MANAGE alongside all people |
| "Time Attendance is about people, not facilities" | Correctly placed under MANAGE |
| "Boundaries feel arbitrary" | Clear organizing principle: protect (Secure) vs people (Manage) vs spaces (Operate) |

#### 2. It matches industry best practices
- **SECURE** mirrors Genetec Security Center's unified security approach
- **MANAGE** mirrors HID SAFE's identity-centric model
- **OPERATE** mirrors Gallagher's building management approach
- **SMART layer** mirrors how ALL competitors treat AI — as cross-cutting, not siloed

#### 3. It's marketable
Each domain maps to a decision-maker:
- **SECURE** → Chief Security Officer / Security Director
- **MANAGE** → HR / Admin / Building Manager  
- **OPERATE** → Facility Manager / Operations Director
- **SMART** → CTO / Innovation team

#### 4. It's simple to explain
> "Duall Master 3.0 has three core domains: **SECURE** protects your building, **MANAGE** handles your people, and **OPERATE** runs your facilities. **SMART** makes everything intelligent."

### Refined Module Mapping

| SECURE 🔒 | MANAGE 👤 | OPERATE 🏢 |
|-----------|-----------|------------|
| Access Control (hardware + policies) | Identity Management | Room Booking |
| Video Surveillance (CCTV) | Visitor Management | Parking Management |
| Intrusion Detection | Contractor Management | Maintenance & Work Orders |
| Intercom & Communications | Time & Attendance | Key Management |
| AI Threat Detection | Delivery Management | Guard Tour & Patrol |
| Emergency & Lockdown | Access Provisioning (who gets what) | IoT Sensors & Energy |

| SMART 🧠 (cross-cutting) | PLATFORM ⚙️ (foundation) |
|--------------------------|-------------------------|
| Unified Dashboard | Cybersecurity |
| Analytics & Reports | API & Integrations |
| AI Assistant | Mobile App |
| Automation Rules | SSO & Authentication |
| Predictive Intelligence | Multi-site Management |

### Why not Option A?
Option A is essentially the same logic but with 4 pillars instead of 3. The "Operations" pillar is weak — guard tour, maintenance, key management, and delivery don't have a strong unifying theme. Option B absorbs delivery into MANAGE (it's about managing a user entering) and the rest into OPERATE (running the building), which is cleaner.

### Why not Option C?
Too abstract. Security buyers want to see "Security" as a first-class concept. Splitting access control between People and Systems is confusing. Less marketable.

---

## 6. Additional Considerations

### Features to Validate / Add Based on Competitor Research

| Feature | Competitor Evidence | Recommendation |
|---------|-------------------|----------------|
| **Cybersecurity / Platform Security** | Every major competitor highlights this (Genetec privacy-by-design, Brivo cybersecurity best practices) | ✅ Include in PLATFORM layer — essential for enterprise sales |
| **Energy Management / Sustainability** | Siemens (Desigo), Gallagher (BMS integration) | ✅ Include in OPERATE — growing requirement for green buildings |
| **Digital Twin / 3D Visualization** | Siemens (BIM), Genetec (Maps) | 🔶 Consider for v3.1 — not core but differentiating |
| **AI/ML Placement** | ALL competitors treat as cross-cutting | ✅ SMART layer is correct — do NOT make it a separate silo |

### Naming Refinement Options

If "MANAGE" feels too generic, consider:

| Option | Pros | Cons |
|--------|------|------|
| **MANAGE** | Universal, simple | Generic |
| **PEOPLE** | Clear, human-centric | Informal for enterprise |
| **IDENTITY** | Industry-standard (PIAM) | Narrow — doesn't obviously include attendance |
| **WORKFORCE** | Strong, professional | Excludes visitors (they're not workforce) |
| **COMMUNITY** | Inclusive of all user types | Unusual in security industry |

**Recommendation:** Use **MANAGE** with subtitle "People & Identity Management" — or **PEOPLE** if the brand voice is modern/friendly.

### Final Architecture Summary

```
╔═══════════════════════════════════════════════════════╗
║                 DUALL MASTER 3.0                      ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║   🧠 SMART ─────────────────────────────────────────  ║
║   AI · Analytics · Automation · Dashboards            ║
║   (enriches everything below)                         ║
║                                                       ║
║   ┌─────────────┬──────────────┬───────────────┐     ║
║   │ 🔒 SECURE    │ 👤 MANAGE    │ 🏢 OPERATE    │     ║
║   │             │              │               │     ║
║   │ Protect the │ Handle all   │ Run the       │     ║
║   │ building    │ people       │ facility      │     ║
║   │             │              │               │     ║
║   │ 8 modules   │ 6 modules    │ 6 modules     │     ║
║   └─────────────┴──────────────┴───────────────┘     ║
║                                                       ║
║   ⚙️ PLATFORM ──────────────────────────────────────  ║
║   Cybersecurity · API · Mobile · SSO · Multi-site     ║
║   (powers everything above)                           ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

---

*Analysis prepared for Duall Master 3.0 product architecture review.*
